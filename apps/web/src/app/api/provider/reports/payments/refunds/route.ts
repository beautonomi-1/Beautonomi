import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { MAX_REPORT_DAYS } from "@/lib/reports/constants";
import {
  filterLedgerRowsForLocation,
  getProviderReportContext,
  reportDateKey,
  reportDateRangeFromParams,
  summarizeLedgerLocationAttribution,
} from "@/lib/reports/provider-report-utils";

const PAGE_SIZE = 1000;

type LedgerRefundRow = {
  id: string;
  transaction_type: string;
  amount: number | null;
  net: number | null;
  booking_id: string | null;
  product_order_id?: string | null;
  source_refund_id?: string | null;
  created_at: string;
  description?: string | null;
};

async function fetchFinanceLedgerSlice(
  supabaseAdmin: SupabaseClient,
  providerId: string,
  fromIso: string,
  toIso: string,
): Promise<LedgerRefundRow[]> {
  const out: LedgerRefundRow[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabaseAdmin
      .from("finance_transactions")
      .select(
        "id, transaction_type, amount, net, booking_id, product_order_id, source_refund_id, created_at, description",
      )
      .eq("provider_id", providerId)
      .in("transaction_type", ["refund", "provider_earnings", "payment"])
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .order("created_at", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw error;
    const chunk = (data ?? []) as LedgerRefundRow[];
    out.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return out;
}

function normalizeRefundDisplayMethod(provider: string | null | undefined, method: string | null | undefined): string {
  const p = (provider || "").toLowerCase().trim();
  if (p === "paystack" || p === "yoco" || p === "stripe") return p;
  const m = (method || "").toLowerCase().trim();
  if (m === "wallet_credit" || m === "wallet_payment") return "wallet";
  if (m) return m;
  return "other";
}

async function resolveRefundMethodLabels(
  supabaseAdmin: SupabaseClient,
  refundRows: LedgerRefundRow[],
): Promise<Map<string, string>> {
  const rowMethod = new Map<string, string>();
  const sourceIds = [...new Set(refundRows.map((r) => r.source_refund_id).filter(Boolean))] as string[];
  if (sourceIds.length === 0) return rowMethod;

  for (let i = 0; i < sourceIds.length; i += 120) {
    const slice = sourceIds.slice(i, i + 120);
    const { data: brs, error } = await supabaseAdmin
      .from("booking_refunds")
      .select("id, payment_id")
      .in("id", slice);
    if (error) throw error;
    const paymentIds = [...new Set((brs ?? []).map((r) => (r as { payment_id?: string }).payment_id).filter(Boolean))] as string[];

    const paymentById = new Map<string, { payment_method?: string; payment_provider?: string }>();
    for (let j = 0; j < paymentIds.length; j += 120) {
      const pSlice = paymentIds.slice(j, j + 120);
      const { data: bps, error: bpErr } = await supabaseAdmin
        .from("booking_payments")
        .select("id, payment_method, payment_provider")
        .in("id", pSlice);
      if (bpErr) throw bpErr;
      for (const bp of bps ?? []) {
        const row = bp as { id: string; payment_method?: string; payment_provider?: string };
        paymentById.set(row.id, {
          payment_method: row.payment_method,
          payment_provider: row.payment_provider,
        });
      }
    }

    for (const br of brs ?? []) {
      const id = (br as { id: string }).id;
      const pid = (br as { payment_id?: string | null }).payment_id;
      if (!pid) continue;
      const bp = paymentById.get(pid);
      const label = normalizeRefundDisplayMethod(bp?.payment_provider, bp?.payment_method);
      rowMethod.set(id, label);
    }
  }

  return rowMethod;
}

export type ProviderRefundsReportResponse = {
  totalRefunds: number;
  totalRefundAmount: number;
  providerEarningsReversed: number;
  totalPaymentLedgerAmount: number;
  /** Customer refund gross (ledger refund rows) ÷ payment ledger rows in range — informational only. */
  refundShareOfPaymentLedgerPercent: number;
  /** @deprecated Same as refundShareOfPaymentLedgerPercent — kept for older clients. */
  refundRate?: number;
  /** @deprecated Same as totalPaymentLedgerAmount — kept for older clients. */
  totalPaymentAmount?: number;
  averageRefundAmount: number;
  methodBreakdown: Array<{ method: string; count: number; amount: number; percentage: number }>;
  dailyBreakdown: Array<{ date: string; count: number; amount: number }>;
  recentRefunds: Array<{
    id: string;
    amount: number;
    created_at: string;
    booking_id: string | null;
    product_order_id?: string | null;
    reason?: string;
    paymentMethodLabel?: string;
  }>;
  timezone: string;
  reportBasis: string;
  locationAttribution: ReturnType<typeof summarizeLedgerLocationAttribution>;
};

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
    const supabaseAdmin = getSupabaseAdmin();

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);

    if (!providerId) return notFoundResponse("Provider not found");

    const searchParams = request.nextUrl.searchParams;
    const reportContext = await getProviderReportContext(supabaseAdmin, providerId);
    const { fromDate, toDate } = reportDateRangeFromParams(searchParams, reportContext.timezone, {
      defaultDays: 30,
      maxDays: MAX_REPORT_DAYS,
    });
    const locationId = searchParams.get("location_id") || undefined;

    let ledgerRows: LedgerRefundRow[];
    try {
      ledgerRows = await fetchFinanceLedgerSlice(
        supabaseAdmin,
        providerId,
        fromDate.toISOString(),
        toDate.toISOString(),
      );
    } catch (e) {
      console.error("[refunds report] finance_transactions fetch failed", e);
      return handleApiError(
        e instanceof Error ? e : new Error(String(e)),
        "We couldn’t load refund data from the ledger. Please try again shortly.",
        "REFUND_LEDGER_FETCH_ERROR",
        500,
      );
    }

    const ledgerLocationAttribution = summarizeLedgerLocationAttribution(ledgerRows, locationId || null);
    let rows = ledgerRows;
    rows = await filterLedgerRowsForLocation(supabaseAdmin, providerId, rows, locationId || null);

    const refundRows = rows.filter((r) => r.transaction_type === "refund");
    const negativeEarningsRows = rows.filter(
      (r) => r.transaction_type === "provider_earnings" && Number(r.net ?? 0) < 0,
    );
    const paymentRows = rows.filter((r) => r.transaction_type === "payment");

    let sourceRefundMethodById = new Map<string, string>();
    try {
      sourceRefundMethodById = await resolveRefundMethodLabels(supabaseAdmin, refundRows);
    } catch (e) {
      console.error("[refunds report] booking_refunds / booking_payments enrichment failed", e);
      return handleApiError(
        e instanceof Error ? e : new Error(String(e)),
        "We couldn’t load refund payment details. Please try again shortly.",
        "REFUND_DETAIL_FETCH_ERROR",
        500,
      );
    }

    const totalRefunds = refundRows.length;
    const totalRefundAmount = refundRows.reduce((sum, r) => sum + Math.abs(Number(r.amount ?? 0)), 0);
    const providerEarningsReversed = negativeEarningsRows.reduce(
      (sum, r) => sum + Math.abs(Number(r.net ?? r.amount ?? 0)),
      0,
    );
    const totalPaymentLedgerAmount = paymentRows.reduce((sum, r) => sum + Number(r.amount ?? 0), 0);
    const refundShareOfPaymentLedgerPercent =
      totalPaymentLedgerAmount > 0 ? (totalRefundAmount / totalPaymentLedgerAmount) * 100 : 0;
    const averageRefundAmount = totalRefunds > 0 ? totalRefundAmount / totalRefunds : 0;

    const refundsByMethod = new Map<string, { count: number; amount: number }>();
    refundRows.forEach((refund) => {
      let method = "ledger";
      if (refund.product_order_id) {
        method = "product_order";
      } else if (refund.source_refund_id && sourceRefundMethodById.has(refund.source_refund_id)) {
        method = sourceRefundMethodById.get(refund.source_refund_id)!;
      }
      const existing = refundsByMethod.get(method) || { count: 0, amount: 0 };
      refundsByMethod.set(method, {
        count: existing.count + 1,
        amount: existing.amount + Math.abs(Number(refund.amount || 0)),
      });
    });

    const methodBreakdown = Array.from(refundsByMethod.entries())
      .map(([method, d]) => ({
        method,
        count: d.count,
        amount: d.amount,
        percentage: totalRefundAmount > 0 ? (d.amount / totalRefundAmount) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    const dailyRefunds = new Map<string, { count: number; amount: number }>();
    refundRows.forEach((refund) => {
      const date = reportDateKey(refund.created_at, reportContext.timezone);
      const existing = dailyRefunds.get(date) || { count: 0, amount: 0 };
      dailyRefunds.set(date, {
        count: existing.count + 1,
        amount: existing.amount + Math.abs(Number(refund.amount || 0)),
      });
    });

    const dailyBreakdown = Array.from(dailyRefunds.entries())
      .map(([date, d]) => ({ date, ...d }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const recentRefunds = refundRows
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 20)
      .map((r) => {
        let paymentMethodLabel: string | undefined;
        if (r.product_order_id) paymentMethodLabel = "product_order";
        else if (r.source_refund_id && sourceRefundMethodById.has(r.source_refund_id)) {
          paymentMethodLabel = sourceRefundMethodById.get(r.source_refund_id);
        }
        return {
          id: r.id,
          amount: Math.abs(Number(r.amount ?? 0)),
          created_at: r.created_at,
          booking_id: r.booking_id,
          product_order_id: r.product_order_id ?? null,
          reason: r.description ?? undefined,
          paymentMethodLabel,
        };
      });

    const payload: ProviderRefundsReportResponse = {
      totalRefunds,
      totalRefundAmount,
      providerEarningsReversed,
      totalPaymentLedgerAmount,
      refundShareOfPaymentLedgerPercent: refundShareOfPaymentLedgerPercent,
      refundRate: refundShareOfPaymentLedgerPercent,
      totalPaymentAmount: totalPaymentLedgerAmount,
      averageRefundAmount,
      methodBreakdown,
      dailyBreakdown,
      recentRefunds,
      timezone: reportContext.timezone,
      reportBasis:
        "Refund rows are finance_transactions.transaction_type = refund by ledger created_at (bucketed by provider timezone). " +
        "Payment rows in the same window are ledger settlement amounts — the ratio is not the same as refunds ÷ revenue. " +
        "Provider earnings reversals are negative provider_earnings rows (your net clawback), separate from customer refund gross. " +
        `${ledgerLocationAttribution.note}`,
      locationAttribution: ledgerLocationAttribution,
    };

    return successResponse(payload);
  } catch (error) {
    return handleApiError(error, "Failed to generate refunds report");
  }
}
