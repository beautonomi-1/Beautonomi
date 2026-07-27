import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProviderRevenueBreakdown } from "@/lib/reports/provider-revenue-semantics";
import { emitMetric } from "@/lib/monitoring/route-metrics";

export const PROVIDER_FINANCE_SUMMARY_RPC_FLAG = "reports.provider_finance_summary_rpc";

type FinanceSummaryRpcRow = {
  serviceEarnings?: number;
  tips?: number;
  travelFees?: number;
  cancellationFees?: number;
  walkInAdditionalCharges?: number;
  recognizedRevenue?: number;
  refundDeduction?: number;
  netAfterRefunds?: number;
};

export function mapFinanceSummaryRpcRow(row: FinanceSummaryRpcRow | null): ProviderRevenueBreakdown | null {
  if (!row) return null;
  return {
    serviceEarnings: Number(row.serviceEarnings ?? 0),
    tips: Number(row.tips ?? 0),
    travelFees: Number(row.travelFees ?? 0),
    cancellationFees: Number(row.cancellationFees ?? 0),
    walkInAdditionalCharges: Number(row.walkInAdditionalCharges ?? 0),
    recognizedRevenue: Number(row.recognizedRevenue ?? 0),
    refundDeduction: Number(row.refundDeduction ?? 0),
    netAfterRefunds: Number(row.netAfterRefunds ?? 0),
  };
}

export async function fetchProviderFinanceSummaryRpc(
  supabase: SupabaseClient,
  providerId: string,
  from: Date,
  to: Date,
): Promise<ProviderRevenueBreakdown | null> {
  const { data, error } = await supabase.rpc("provider_finance_summary" as never, {
    p_provider_id: providerId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  } as never);
  if (error) {
    console.warn("[provider_finance_summary_rpc] fetch failed:", error.message);
    return null;
  }
  return mapFinanceSummaryRpcRow((data ?? null) as FinanceSummaryRpcRow | null);
}

export function shadowCompareFinanceSummary(
  js: ProviderRevenueBreakdown,
  rpc: ProviderRevenueBreakdown,
  context: { providerId: string; route: string },
): boolean {
  const keys = [
    "serviceEarnings",
    "tips",
    "travelFees",
    "cancellationFees",
    "walkInAdditionalCharges",
    "recognizedRevenue",
    "refundDeduction",
    "netAfterRefunds",
  ] as const;
  let ok = true;
  for (const key of keys) {
    const diff = Math.abs(Number(js[key] ?? 0) - Number(rpc[key] ?? 0));
    if (diff > 0.01) {
      ok = false;
      emitMetric("provider_finance_summary_rpc_mismatch", {
        route: context.route,
        provider_id: context.providerId,
        field: key,
        js: js[key],
        rpc: rpc[key],
      });
    }
  }
  return ok;
}
