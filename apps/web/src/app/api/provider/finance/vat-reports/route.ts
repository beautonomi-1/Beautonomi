import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * GET /api/provider/finance/vat-reports
 * 
 * Get VAT reports for bi-monthly periods (aligned with SARS periods)
 * SARS periods: Jan-Feb, Mar-Apr, May-Jun, Jul-Aug, Sep-Oct, Nov-Dec
 * Deadlines: 25th of month after period (e.g., Jan-Feb period deadline is 25 Mar)
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const { searchParams } = new URL(request.url);
    const providerId = await getProviderIdForUser(user.id, supabase);
    
    if (!providerId) {
      return successResponse({ reports: [] });
    }

    // Check if provider is VAT-registered
    const { data: provider, error: providerError } = await supabase
      .from("providers")
      .select("is_vat_registered, vat_number")
      .eq("id", providerId)
      .single();

    if (providerError) throw providerError;

    if (!provider?.is_vat_registered) {
      return successResponse({ 
        reports: [],
        provider: {
          vat_number: null,
          is_vat_registered: false,
        },
        year: parseInt(searchParams.get("year") || new Date().getFullYear().toString()),
        message: "Provider is not VAT-registered. VAT reports are only available for VAT-registered providers."
      });
    }

    // Get year filter (default: current year)
    const year = parseInt(searchParams.get("year") || new Date().getFullYear().toString());

    // Calculate bi-monthly periods for the year
    const periods = [];
    for (let month = 0; month < 12; month += 2) {
      const periodStart = new Date(year, month, 1);
      const periodEnd = new Date(year, month + 2, 0); // Last day of second month
      const deadlineDate = new Date(year, month + 2, 25); // 25th of month after period
      
      periods.push({
        period_start: periodStart.toISOString().split('T')[0],
        period_end: periodEnd.toISOString().split('T')[0],
        deadline_date: deadlineDate.toISOString().split('T')[0],
        period_label: `${periodStart.toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' })} - ${periodEnd.toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' })}`,
      });
    }

    // Get VAT transactions for each period
    const reports = await Promise.all(
      periods.map(async (period) => {
        const { data: vatTransactions, error: vatError } = await supabase
          .from("finance_transactions")
          .select("id, net, created_at, booking_id, description")
          .eq("provider_id", providerId)
          .eq("transaction_type", "tax")
          .gte("created_at", `${period.period_start}T00:00:00.000Z`)
          .lte("created_at", `${period.period_end}T23:59:59.999Z`);

        if (vatError) {
          console.error(`Error fetching VAT for period ${period.period_label}:`, vatError);
          return {
            ...period,
            vat_collected: 0,
            transaction_count: 0,
            transactions: [],
            error: vatError.message,
          };
        }

        const vatCollected = (vatTransactions || []).reduce(
          (sum, t) => sum + Number(t.net || 0),
          0
        );

        // Get booking details for transactions
        const bookingIds = [...new Set((vatTransactions || []).map(t => t.booking_id).filter(Boolean))];
        let bookings: any[] = [];
        if (bookingIds.length > 0) {
          const { data: bookingData } = await supabase
            .from("bookings")
            .select("id, booking_number, scheduled_at, total_amount, tax_amount")
            .in("id", bookingIds);
          bookings = bookingData || [];
        }

        // Check if reminder was sent and remittance status
        const { data: reminder } = await supabase
          .from("vat_remittance_reminders")
          .select("id, sent_at, days_before_deadline, remitted_to_sars, remitted_at")
          .eq("provider_id", providerId)
          .eq("period_start", period.period_start)
          .eq("period_end", period.period_end)
          .order("sent_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const now = new Date();
        const deadline = new Date(period.deadline_date);
        const daysUntilDeadline = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        const isOverdue = deadline < now && vatCollected > 0;

        return {
          ...period,
          vat_collected: vatCollected,
          vat_collected_formatted: new Intl.NumberFormat('en-ZA', {
            style: 'currency',
            currency: 'ZAR',
          }).format(vatCollected),
          transaction_count: vatTransactions?.length || 0,
          transactions: (vatTransactions || []).map(t => {
            const booking = bookings.find(b => b.id === t.booking_id);
            return {
              id: t.id,
              amount: Number(t.net || 0),
              booking_number: booking?.booking_number || 'N/A',
              booking_date: booking?.scheduled_at || t.created_at,
              description: t.description,
            };
          }),
          reminder_sent: reminder ? {
            sent_at: reminder.sent_at,
            days_before_deadline: reminder.days_before_deadline,
          } : null,
          reminder_id: reminder?.id || null,
          remitted_to_sars: reminder?.remitted_to_sars || false,
          remitted_at: reminder?.remitted_at || null,
          days_until_deadline: daysUntilDeadline,
          is_overdue: deadline < now && vatCollected > 0 && !(reminder?.remitted_to_sars),
          status: reminder?.remitted_to_sars ? 'remitted' : (isOverdue ? 'overdue' : daysUntilDeadline <= 7 ? 'due_soon' : 'upcoming'),
        };
      })
    );

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
