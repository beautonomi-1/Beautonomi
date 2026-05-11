import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getProviderIdForUser, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { requireAnyPermission } from "@/lib/auth/requirePermission";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { getTenantLocaleTagFromRegionConfig } from "@/lib/locale/tenant-locale";
import { dateRangeBoundsUtc, formatDateYmd, formatInTz } from "@/lib/dates/provider-tz";
import { endOfMonth } from "date-fns";
import { toZonedTime } from "date-fns-tz";

/**
 * GET /api/provider/finance/vat-reports
 * 
 * Get VAT reports for bi-monthly periods (aligned with SARS periods)
 * SARS periods: Jan-Feb, Mar-Apr, May-Jun, Jul-Aug, Sep-Oct, Nov-Dec
 * Deadlines: 25th of month after period (e.g., Jan-Feb period deadline is 25 Mar)
 */
export async function GET(request: NextRequest) {
  try {
    const permissionCheck = await requireAnyPermission(["view_sales", "view_reports", "process_payments"], request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const { searchParams } = new URL(request.url);
    const providerId = await getProviderIdForUser(user.id, supabase);
    
    if (!providerId) {
      return successResponse({ reports: [] });
    }

    // Check if provider is VAT-registered
    const { data: provider, error: providerError } = await supabase
      .from("providers")
      .select("is_vat_registered, vat_number, tenant_id, timezone")
      .eq("id", providerId)
      .maybeSingle();

    if (providerError) throw providerError;
    if (!provider) return successResponse({ reports: [] });

    const providerTimezoneEarly =
      (provider as { timezone?: string | null }).timezone || "Africa/Johannesburg";
    const defaultCalendarYear = parseInt(
      formatDateYmd(new Date(), providerTimezoneEarly).slice(0, 4),
      10,
    );

    if (!provider?.is_vat_registered) {
      return successResponse({ 
        reports: [],
        provider: {
          vat_number: null,
          is_vat_registered: false,
        },
        year: parseInt(searchParams.get("year") || String(defaultCalendarYear)),
        message: "Provider is not VAT-registered. VAT reports are only available for VAT-registered providers."
      });
    }

    const effectiveTenantId =
      (provider as { tenant_id?: string | null }).tenant_id ??
      (await resolveTenantIdWithZaFallback(request));
    const tenantRegion = await getTenantRegionConfig(effectiveTenantId);
    const lastResortCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;
    const intlLocale = getTenantLocaleTagFromRegionConfig(tenantRegion);
    const providerTimezone = (provider as { timezone?: string | null }).timezone || "Africa/Johannesburg";

    // Get year filter (default: calendar year in provider timezone)
    const year = parseInt(searchParams.get("year") || String(defaultCalendarYear));

    // Calculate bi-monthly periods for the year (civil calendar; boundaries queried via dateRangeBoundsUtc)
    const periods: {
      period_start: string;
      period_end: string;
      deadline_date: string;
      period_label: string;
    }[] = [];
    for (let month = 0; month < 12; month += 2) {
      const period_start = `${year}-${String(month + 1).padStart(2, "0")}-01`;
      const secondMonthYmd = `${year}-${String(month + 2).padStart(2, "0")}-01`;
      const zSecond = toZonedTime(new Date(`${secondMonthYmd}T12:00:00.000Z`), providerTimezone);
      const period_end = formatDateYmd(endOfMonth(zSecond), providerTimezone);

      let deadlineMonth = month + 3;
      let deadlineYear = year;
      if (deadlineMonth > 12) {
        deadlineMonth -= 12;
        deadlineYear += 1;
      }
      const deadline_date = `${deadlineYear}-${String(deadlineMonth).padStart(2, "0")}-25`;

      const { fromIso: pStartIso } = dateRangeBoundsUtc(period_start, period_start, providerTimezone);
      const { fromIso: pEndIso } = dateRangeBoundsUtc(period_end, period_end, providerTimezone);
      const period_label = `${formatInTz(new Date(pStartIso), "MMM yyyy", providerTimezone)} – ${formatInTz(new Date(pEndIso), "MMM yyyy", providerTimezone)}`;

      periods.push({
        period_start,
        period_end,
        deadline_date,
        period_label,
      });
    }

    // Batch all 3 DB queries for the full year in one go instead of per-period (18→3 queries).
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;
    const { fromIso: yearFromIso } = dateRangeBoundsUtc(yearStart, yearStart, providerTimezone);
    const { toIso: yearToIso } = dateRangeBoundsUtc(yearEnd, yearEnd, providerTimezone);

    const [vatTxResult, remindersResult] = await Promise.all([
      supabase
        .from("finance_transactions")
        .select("id, amount, net, created_at, booking_id, description")
        .eq("provider_id", providerId)
        .eq("transaction_type", "tax")
        .gte("created_at", yearFromIso)
        .lte("created_at", yearToIso),
      supabase
        .from("vat_remittance_reminders")
        .select("id, sent_at, days_before_deadline, remitted_to_sars, remitted_at, period_start, period_end")
        .eq("provider_id", providerId)
        .gte("period_start", yearStart)
        .lte("period_start", yearEnd)
        .order("sent_at", { ascending: false }),
    ]);

    const allVatTx: any[] = vatTxResult.data || [];

    // Batch-fetch all booking details referenced across the year's transactions.
    const allBookingIds = [...new Set(allVatTx.map((t: any) => t.booking_id).filter(Boolean))] as string[];
    const bookingMap = new Map<string, any>();
    if (allBookingIds.length > 0) {
      const { data: bookingData } = await supabase
        .from("bookings")
        .select("id, booking_number, scheduled_at, total_amount, tax_amount")
        .in("id", allBookingIds);
      for (const b of bookingData || []) bookingMap.set(b.id, b);
    }

    // Index reminders by period_start (take most recent per period).
    const reminderMap = new Map<string, any>();
    for (const r of (remindersResult.data || []) as any[]) {
      if (!reminderMap.has(r.period_start)) reminderMap.set(r.period_start, r);
    }

    const now = new Date();
    const reports = periods.map((period) => {
      const { fromIso, toIso } = dateRangeBoundsUtc(period.period_start, period.period_end, providerTimezone);
      const periodFrom = new Date(fromIso);
      const periodTo = new Date(toIso);

      const vatTransactions = allVatTx.filter((t: any) => {
        const d = new Date(t.created_at);
        return d >= periodFrom && d <= periodTo;
      });

      if (vatTxResult.error) {
        console.error(`Error fetching VAT for period ${period.period_label}:`, vatTxResult.error);
        return {
          ...period,
          vat_collected: 0,
          transaction_count: 0,
          transactions: [],
          error: vatTxResult.error.message,
        };
      }

      const vatCollected = vatTransactions.reduce(
        (sum: number, t: any) => {
          const net = Number(t.net ?? 0);
          return sum + (net !== 0 ? net : Number(t.amount ?? 0));
        },
        0
      );

      const reminder = reminderMap.get(period.period_start) ?? null;
      const deadline = new Date(period.deadline_date);
      const daysUntilDeadline = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const isOverdue = deadline < now && vatCollected > 0;

      return {
        ...period,
        vat_collected: vatCollected,
        vat_collected_formatted: new Intl.NumberFormat(intlLocale, {
          style: "currency",
          currency: lastResortCurrency,
        }).format(vatCollected),
        transaction_count: vatTransactions.length,
        transactions: vatTransactions.map((t: any) => {
          const booking = bookingMap.get(t.booking_id);
          return {
            id: t.id,
            amount: Number(t.net || 0) !== 0 ? Number(t.net || 0) : Number(t.amount || 0),
            booking_number: booking?.booking_number ?? "N/A",
            booking_date: booking?.scheduled_at ?? t.created_at,
            description: t.description,
          };
        }),
        reminder_sent: reminder
          ? { sent_at: reminder.sent_at, days_before_deadline: reminder.days_before_deadline }
          : null,
        reminder_id: reminder?.id ?? null,
        remitted_to_sars: reminder?.remitted_to_sars ?? false,
        remitted_at: reminder?.remitted_at ?? null,
        days_until_deadline: daysUntilDeadline,
        is_overdue: deadline < now && vatCollected > 0 && !reminder?.remitted_to_sars,
        status: reminder?.remitted_to_sars
          ? "remitted"
          : isOverdue
          ? "overdue"
          : daysUntilDeadline <= 7
          ? "due_soon"
          : "upcoming",
      };
    });

    // Sort by period start (most recent first)
    reports.sort((a, b) => 
      new Date(b.period_start).getTime() - new Date(a.period_start).getTime()
    );

    return successResponse({
      reports,
      provider: {
        vat_number: provider.vat_number,
        is_vat_registered: provider.is_vat_registered,
      },
      year,
    });
  } catch (error) {
    return handleApiError(error, "Failed to load VAT reports");
  }
}
