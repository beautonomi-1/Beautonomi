import type { SupabaseClient } from "@supabase/supabase-js";
import { SUBSCRIPTION_ENTITLED_STATUSES } from "@/lib/subscriptions/feature-access";

export const UPSELL_OWNERSHIP_STATUSES = ["no_terminal", "planning_to_get_terminal"] as const;
export type UpsellOwnershipStatus = (typeof UPSELL_OWNERSHIP_STATUSES)[number];

export type TerminalInsightsSegment =
  | "all"
  | "upsell_opportunities"
  | "interested"
  | "has_terminal";

export const TERMINAL_UPSELL_PIPELINE_STATUSES = [
  "new",
  "contacted",
  "quoted",
  "won",
  "lost",
  "dismissed",
] as const;

export type TerminalUpsellPipelineStatus = (typeof TERMINAL_UPSELL_PIPELINE_STATUSES)[number];

const ACTIVE_TERMINAL_ORDER_STATUSES = [
  "confirmed",
  "processing",
  "dispatched",
  "delivered",
] as const;

const ACTIVE_PAYCLOUD_TERMINAL_STATUSES = ["assigned", "active"] as const;

function normalizeProviderEmbed(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return (raw[0] as Record<string, unknown>) ?? null;
  return raw as Record<string, unknown>;
}

function normalizeSubscriptionPlan(
  plan: SubscriptionRow["subscription_plans"],
): SubscriptionRow["subscription_plans"] {
  if (!plan) return null;
  if (Array.isArray(plan)) return (plan[0] as SubscriptionRow["subscription_plans"]) ?? null;
  return plan;
}

export function planFeaturesIncludeTerminalBundle(features: unknown): boolean {
  if (!features || typeof features !== "object") return false;
  const bundle = (features as Record<string, unknown>).terminal_bundle;
  if (!bundle || typeof bundle !== "object") return false;
  return (bundle as Record<string, unknown>).enabled === true;
}

export function isUpsellOwnershipStatus(status: string | null | undefined): boolean {
  return (
    status != null &&
    (UPSELL_OWNERSHIP_STATUSES as readonly string[]).includes(status)
  );
}

type SubscriptionRow = {
  plan_id?: string | null;
  status?: string | null;
  subscription_plans?: { id?: string; name?: string; slug?: string; features?: unknown } | null;
};

export function pickActiveSubscription(
  subscriptions: SubscriptionRow[] | null | undefined,
): SubscriptionRow | null {
  if (!subscriptions?.length) return null;
  const entitled = new Set<string>(SUBSCRIPTION_ENTITLED_STATUSES);
  return (
    subscriptions.find((sub) => sub.status != null && entitled.has(sub.status)) ?? null
  );
}

export function providerHasTerminalBundlePlan(
  subscriptions: SubscriptionRow[] | null | undefined,
  bundlePlanIds: ReadonlySet<string>,
): boolean {
  if (!subscriptions?.length) return false;
  const entitled = new Set<string>(SUBSCRIPTION_ENTITLED_STATUSES);
  for (const sub of subscriptions) {
    if (!sub.status || !entitled.has(sub.status)) continue;
    if (sub.plan_id && bundlePlanIds.has(sub.plan_id)) return true;
    const plan = normalizeSubscriptionPlan(sub.subscription_plans);
    if (planFeaturesIncludeTerminalBundle(plan?.features)) return true;
  }
  return false;
}

export function isTerminalUpsellOpportunity(params: {
  terminalOwnershipStatus: string | null | undefined;
  hasBundlePlan: boolean;
  hasTerminalHardware: boolean;
}): boolean {
  if (!isUpsellOwnershipStatus(params.terminalOwnershipStatus)) return false;
  if (params.hasBundlePlan) return false;
  if (params.hasTerminalHardware) return false;
  return true;
}

export type TerminalUpsellSegmentContext = {
  bundlePlanIds: Set<string>;
  hardwareProviderIds: Set<string>;
};

export async function loadTerminalUpsellSegmentContext(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<TerminalUpsellSegmentContext> {
  const [{ data: plans }, { data: orders }, { data: paycloud }] = await Promise.all([
    supabase
      .from("subscription_plans")
      .select("id, features")
      .eq("tenant_id", tenantId),
    supabase
      .from("terminal_orders")
      .select("provider_id")
      .eq("tenant_id", tenantId)
      .in("order_status", [...ACTIVE_TERMINAL_ORDER_STATUSES]),
    supabase
      .from("paycloud_terminals")
      .select("provider_id")
      .eq("tenant_id", tenantId)
      .in("status", [...ACTIVE_PAYCLOUD_TERMINAL_STATUSES])
      .not("provider_id", "is", null),
  ]);

  const bundlePlanIds = new Set<string>();
  for (const plan of plans ?? []) {
    if (planFeaturesIncludeTerminalBundle((plan as { features?: unknown }).features)) {
      bundlePlanIds.add((plan as { id: string }).id);
    }
  }

  const hardwareProviderIds = new Set<string>();
  for (const row of orders ?? []) {
    const pid = (row as { provider_id?: string }).provider_id;
    if (pid) hardwareProviderIds.add(pid);
  }
  for (const row of paycloud ?? []) {
    const pid = (row as { provider_id?: string | null }).provider_id;
    if (pid) hardwareProviderIds.add(pid);
  }

  return { bundlePlanIds, hardwareProviderIds };
}

export function enrichTerminalInsightRow(
  row: Record<string, unknown>,
  context: TerminalUpsellSegmentContext,
) {
  const provider = normalizeProviderEmbed(row.providers);
  const subscriptions = (provider?.provider_subscriptions ?? []) as SubscriptionRow[];
  const activeSub = pickActiveSubscription(subscriptions);
  const plan = normalizeSubscriptionPlan(activeSub?.subscription_plans ?? null);
  const providerId = String(row.provider_id ?? "");
  const hasBundlePlan = providerHasTerminalBundlePlan(subscriptions, context.bundlePlanIds);
  const hasTerminalHardware = context.hardwareProviderIds.has(providerId);
  const isUpsellOpportunity = isTerminalUpsellOpportunity({
    terminalOwnershipStatus: (row.terminal_ownership_status as string | null) ?? null,
    hasBundlePlan,
    hasTerminalHardware,
  });

  const upsellLead =
    provider?.terminal_upsell_leads ?? row.terminal_upsell_leads;
  const leadRow = Array.isArray(upsellLead) ? upsellLead[0] : upsellLead;

  return {
    ...row,
    providers: provider ?? row.providers,
    plan_name: (plan?.name as string | null) ?? null,
    plan_slug: (plan?.slug as string | null) ?? null,
    subscription_status: (activeSub?.status as string | null) ?? null,
    plan_includes_terminal: hasBundlePlan,
    is_upsell_opportunity: isUpsellOpportunity,
    has_terminal_hardware: hasTerminalHardware,
    upsell_lead: leadRow
      ? {
          id: leadRow.id,
          status: leadRow.status,
          assigned_to: leadRow.assigned_to,
          notes: leadRow.notes,
          updated_at: leadRow.updated_at,
        }
      : null,
  };
}

export function rowMatchesSegment(
  enriched: ReturnType<typeof enrichTerminalInsightRow>,
  segment: TerminalInsightsSegment,
): boolean {
  const row = enriched as Record<string, unknown>;
  if (segment === "all") return true;
  if (segment === "upsell_opportunities") return enriched.is_upsell_opportunity === true;
  if (segment === "interested") {
    return (
      enriched.is_upsell_opportunity === true &&
      row.interested_in_platform_terminal === "yes"
    );
  }
  if (segment === "has_terminal") {
    return row.terminal_ownership_status === "has_terminal";
  }
  return true;
}
