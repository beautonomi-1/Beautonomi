import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getProviderIdForUser, handleApiError } from "@/lib/supabase/api-helpers";
import { requireAnyPermission } from "@/lib/auth/requirePermission";
import { formatDateYmd } from "@/lib/dates/provider-tz";
import { filterLedgerRowsForLocation, getProviderReportContext } from "@/lib/reports/provider-report-utils";
import { resolveProviderFinanceRangeBounds } from "@/lib/dates/provider-finance-range";
import { fetchAllPaged } from "@/lib/provider-ops/postgrest-unbounded";
import { MAX_FINANCE_TRANSACTIONS } from "@/lib/reports/constants";

export const maxDuration = 60;

function csvEscape(value: any): string {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

/**
 * GET /api/provider/finance/export?range=today|week|month|year|all&location_id=
 * Full CSV export of finance_transactions for the provider.
 *
 * Optional `location_id` scopes rows to the selected branch using the same inclusive
 * semantics as the Money hub (at-home / walk-in bookings with no branch included;
 * payouts and provider-level charges remain visible when a branch is selected).
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
    const locationId = searchParams.get("location_id");
    const now = new Date();
    const reportContext = await getProviderReportContext(db as any, providerId);
    const startIso = resolveProviderFinanceRangeBounds(range, reportContext.timezone, now).startIso;
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

    const data = await fetchAllPaged<LedgerRow>(async (from, to) => {
      const { data: page, error } = await db
        .from("finance_transactions")
        .select(
          "id, created_at, transaction_type, amount, net, fees, commission, currency, status, booking_id, product_order_id, source_payment_id, description",
        )
        .eq("provider_id", providerId)
        .gte("created_at", startIso)
        .lte("created_at", endIso)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to);
      return { data: page as LedgerRow[] | null, error };
    }, MAX_FINANCE_TRANSACTIONS);

    const scopedData = locationId
      ? await filterLedgerRowsForLocation(db, providerId, data, locationId, {
          unattributedRows: "include",
        })
      : data;

    const bookingIds = [...new Set(scopedData.map((r) => r.booking_id).filter(Boolean) as string[])];
    const sourcePaymentIds = [...new Set(scopedData.map((r) => r.source_payment_id).filter(Boolean) as string[])];

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
    for (const r of scopedData) {
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

