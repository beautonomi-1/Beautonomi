import type { SupabaseClient } from "@supabase/supabase-js";
import type { OpsDesk } from "@/lib/provider-ops/ops-desk-roles";

export const OPS_QUOTA_METRICS = [
  "leads_contacted",
  "leads_won",
  "providers_activated",
  "first_bookings",
  "at_risk_saves",
  "providers_returned",
] as const;

export type OpsQuotaMetric = (typeof OPS_QUOTA_METRICS)[number];

function ownerColumnForDesk(desk: OpsDesk): string {
  if (desk === "sales") return "sales_owner_id";
  if (desk === "onboarding") return "onboarding_owner_id";
  return "retention_owner_id";
}

function timestampColumnForMetric(metric: OpsQuotaMetric): string | null {
  if (metric === "leads_contacted") return "first_contacted_at";
  if (metric === "leads_won") return "won_at";
  if (metric === "providers_activated") return "activated_at";
  if (metric === "first_bookings") return "first_booking_at";
  if (metric === "at_risk_saves") return "at_risk_saved_at";
  if (metric === "providers_returned") return "returned_at";
  return null;
}

/** Count quota attainment for one rep/metric in the current period. */
export async function countOpsQuotaActual(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    userId: string;
    desk: OpsDesk;
    metric: string;
    periodStart: Date;
  },
): Promise<number> {
  const metric = params.metric as OpsQuotaMetric;
  if (!OPS_QUOTA_METRICS.includes(metric)) return 0;

  const ownerCol = ownerColumnForDesk(params.desk);
  const tsCol = timestampColumnForMetric(metric);
  if (!tsCol) return 0;

  const { count } = await supabase
    .from("provider_ops_cases")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", params.tenantId)
    .eq(ownerCol, params.userId)
    .gte(tsCol, params.periodStart.toISOString());

  return count ?? 0;
}
