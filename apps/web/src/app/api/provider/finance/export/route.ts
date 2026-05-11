import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getProviderIdForUser, handleApiError } from "@/lib/supabase/api-helpers";
import { requireAnyPermission } from "@/lib/auth/requirePermission";
import { dateRangeBoundsUtc, formatDateYmd } from "@/lib/dates/provider-tz";
import { getProviderReportContext } from "@/lib/reports/provider-report-utils";
import { subDays, subYears, startOfMonth } from "date-fns";
import { toZonedTime } from "date-fns-tz";

function csvEscape(value: any): string {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

function formatRangeStart(range: string, timezone: string): Date {
  const now = new Date();
  const todayYmd = formatDateYmd(now, timezone);
  const zNow = toZonedTime(now, timezone);
  if (range === "all") return new Date(0);
  if (range === "week") {
    const fromYmd = formatDateYmd(subDays(zNow, 7), timezone);
    return new Date(dateRangeBoundsUtc(fromYmd, todayYmd, timezone).fromIso);
  }
  if (range === "year") {
    const fromYmd = formatDateYmd(subYears(zNow, 1), timezone);
    return new Date(dateRangeBoundsUtc(fromYmd, todayYmd, timezone).fromIso);
  }
  const monthStartYmd = formatDateYmd(startOfMonth(zNow), timezone);
  return new Date(dateRangeBoundsUtc(monthStartYmd, monthStartYmd, timezone).fromIso);
}

/**
 * GET /api/provider/finance/export?range=month|week|year|all
 * Full CSV export of finance_transactions for the provider (org-wide; not branch-filtered).
 *
 * Columns mirror the admin export shape so providers can reconcile their ledger against
 * the platform's view without a column-mapping step. Includes booking/order references,
 * gateway fees, commission, currency, status, and the underlying payment_method when the
 * row is sourced from a `booking_payments` row (via `source_payment_id`).
 *
 * `location_id` is ignored — use the location-scoped reports (end-of-day, payments
 * summary, payouts) for branch-filtered exports.
 */
export async function GET(request: NextRequest) {
  try {
    const permissionCheck = await requireAnyPermission(["view_sales", "view_reports", "process_payments"], request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    const header = [
      "id",
      "created_at",
      "transaction_type",
      "amount",
      "net",
      "fees",
      "commission",
      "currency",
      "status",
      "booking_id",
      "booking_number",
      "product_order_id",
      "payment_method",
      "payment_provider",
      "description",
    ];

    if (!providerId) {
      return new Response(header.join(",") + "\n", {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="provider-finance.csv"`,
        },
      });
    }

    const db = getSupabaseAdmin();

    const { searchParams } = new URL(request.url);
    const range = searchParams.get("range") || "month";
    const now = new Date();
    const reportContext = await getProviderReportContext(db as any, providerId);
    const startDate = formatRangeStart(range, reportContext.timezone);
    const startIso = startDate.toISOString();
    const endIso = now.toISOString();

    type LedgerRow = {
      id: string;
      created_at?: string;
      transaction_type?: string;
      amount?: number;
      net?: number;
      fees?: number;
      commission?: number;
      currency?: string;
      status?: string;
      booking_id?: string | null;
      product_order_id?: string | null;
      source_payment_id?: string | null;
      description?: string | null;
    };

    const data: LedgerRow[] = [];
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data: page, error } = await db
        .from("finance_transactions")
        .select(
          "id, created_at, transaction_type, amount, net, fees, commission, currency, status, booking_id, product_order_id, source_payment_id, description",
        )
        .eq("provider_id", providerId)
        .gte("created_at", startIso)
        .lte("created_at", endIso)
        .order("created_at", { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      data.push(...((page ?? []) as LedgerRow[]));
      if (!page || page.length < pageSize) break;
    }

    const bookingIds = [...new Set(data.map((r) => r.booking_id).filter(Boolean) as string[])];
    const sourcePaymentIds = [...new Set(data.map((r) => r.source_payment_id).filter(Boolean) as string[])];

    const bookingNumberMap = new Map<string, string>();
    if (bookingIds.length > 0) {
      for (let i = 0; i < bookingIds.length; i += 200) {
        const slice = bookingIds.slice(i, i + 200);
        const { data: rows } = await db
          .from("bookings")
          .select("id, booking_number")
          .eq("provider_id", providerId)
          .in("id", slice);
        for (const r of (rows ?? []) as Array<{ id: string; booking_number?: string }>) {
          if (r.booking_number) bookingNumberMap.set(r.id, r.booking_number);
        }
      }
    }

    const paymentMethodMap = new Map<string, { method: string | null; provider: string | null }>();
    if (sourcePaymentIds.length > 0) {
      for (let i = 0; i < sourcePaymentIds.length; i += 200) {
        const slice = sourcePaymentIds.slice(i, i + 200);
        const { data: rows } = await db
          .from("booking_payments")
          .select("id, payment_method, payment_provider")
          .in("id", slice);
        for (const r of (rows ?? []) as Array<{ id: string; payment_method?: string; payment_provider?: string }>) {
          paymentMethodMap.set(r.id, {
            method: r.payment_method ?? null,
            provider: r.payment_provider ?? null,
          });
        }
      }
    }

    const lines = [header.join(",")];
    for (const r of data) {
      const paymentInfo = r.source_payment_id ? paymentMethodMap.get(r.source_payment_id) : null;
      lines.push(
        [
          csvEscape(r.id),
          csvEscape(r.created_at),
          csvEscape(r.transaction_type),
          csvEscape(r.amount ?? 0),
          csvEscape(r.net ?? 0),
          csvEscape(r.fees ?? 0),
          csvEscape(r.commission ?? 0),
          csvEscape(r.currency ?? ""),
          csvEscape(r.status ?? ""),
          csvEscape(r.booking_id ?? ""),
          csvEscape(r.booking_id ? bookingNumberMap.get(r.booking_id) ?? "" : ""),
          csvEscape(r.product_order_id ?? ""),
          csvEscape(paymentInfo?.method ?? ""),
          csvEscape(paymentInfo?.provider ?? ""),
          csvEscape(r.description ?? ""),
        ].join(","),
      );
    }

    const filename = `provider-finance-${range}-${formatDateYmd(now, reportContext.timezone)}.csv`;
    return new Response(lines.join("\n") + "\n", {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to export finance CSV");
  }
}

