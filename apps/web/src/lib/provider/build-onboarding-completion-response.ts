import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchScopedSingle } from "@/lib/tenant/scoped-overrides";

export interface ResolvedOnboardingPlan {
  selectedPlanIsFree: boolean;
  selectedPlanRequiresCheckout: boolean;
  selectedSubscriptionPlanId: string | null;
}

export interface OnboardingCompletionPayload {
  provider: Record<string, unknown>;
  message: string;
  auto_approved?: boolean;
  selected_plan_id: string | null;
  selected_plan_is_free: boolean;
  selected_subscription_plan_id: string | null;
  requires_checkout: boolean;
  checkout_path: string | null;
  subscription_endpoint: string | null;
  subscription_active: boolean;
  already_completed?: boolean;
  auto_configured?: {
    zones: number;
    services: number;
    mobile_ready: boolean;
    travel_fee_defaults: boolean;
  };
}

/**
 * Resolve checkout requirements from the selected pricing_plans card.
 */
export async function resolveSelectedOnboardingPlan(
  supabaseAdmin: SupabaseClient,
  tenantId: string,
  selectedPlanId: string | null | undefined,
): Promise<ResolvedOnboardingPlan> {
  if (!selectedPlanId) {
    return {
      selectedPlanIsFree: false,
      selectedPlanRequiresCheckout: false,
      selectedSubscriptionPlanId: null,
    };
  }

  const scopedSelectedPlan = await fetchScopedSingle<Record<string, unknown>>({
    supabase: supabaseAdmin,
    table: "pricing_plans",
    tenantId,
    select:
      "id, price, paystack_plan_code_monthly, paystack_plan_code_yearly, subscription_plan_id",
    apply: (q) => q.eq("id", selectedPlanId).eq("is_active", true),
    orderBy: { column: "updated_at", ascending: false },
  });
  const selectedPlan = scopedSelectedPlan.data as
    | {
        id?: string;
        price?: string | number | null;
        paystack_plan_code_monthly?: string | null;
        paystack_plan_code_yearly?: string | null;
        subscription_plan_id?: string | null;
      }
    | null;

  const hasAnyPaystackCode = Boolean(
    selectedPlan?.paystack_plan_code_monthly || selectedPlan?.paystack_plan_code_yearly,
  );

  const numericPrice = Number.parseFloat(
    String(selectedPlan?.price ?? "")
      .replace(/[^0-9.]/g, "")
      .trim(),
  );
  const isFreeByPrice =
    !selectedPlan?.price ||
    Number.isNaN(numericPrice) ||
    numericPrice === 0 ||
    /free/i.test(String(selectedPlan?.price ?? ""));

  const selectedPlanIsFree = isFreeByPrice && !hasAnyPaystackCode;

  return {
    selectedPlanIsFree,
    selectedPlanRequiresCheckout: !selectedPlanIsFree,
    selectedSubscriptionPlanId: selectedPlan?.subscription_plan_id ?? null,
  };
}

async function providerHasActiveSubscription(
  supabaseAdmin: SupabaseClient,
  providerId: string,
): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("provider_subscriptions")
    .select("id, status")
    .eq("provider_id", providerId)
    .eq("status", "active")
    .maybeSingle();
  return Boolean(data?.id);
}

async function providerHasActivePaidSubscription(
  supabaseAdmin: SupabaseClient,
  providerId: string,
): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("provider_subscriptions")
    .select("id, plan_id")
    .eq("provider_id", providerId)
    .eq("status", "active")
    .maybeSingle();

  if (!data?.plan_id) return false;

  const { data: plan } = await supabaseAdmin
    .from("subscription_plans")
    .select("is_free")
    .eq("id", data.plan_id)
    .maybeSingle();

  return (plan as { is_free?: boolean | null } | null)?.is_free === false;
}

/**
 * Ensure subscription row exists for free-plan onboarding; retry once on failure.
 */
export async function ensureSubscriptionForOnboardingCompletion(
  supabaseAdmin: SupabaseClient,
  providerId: string,
  tenantId: string,
  plan: ResolvedOnboardingPlan,
): Promise<boolean> {
  const hasSubscription = await providerHasActiveSubscription(supabaseAdmin, providerId);
  if (hasSubscription) return true;

  if (!plan.selectedPlanIsFree) {
    return false;
  }

  const { ensureProviderFreeSubscriptionRow } = await import(
    "@/lib/subscriptions/ensure-provider-free-subscription"
  );

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await ensureProviderFreeSubscriptionRow(
        supabaseAdmin,
        providerId,
        tenantId,
        plan.selectedSubscriptionPlanId,
      );
      if (result.ok || result.skipped === "already_subscribed") {
        return providerHasActiveSubscription(supabaseAdmin, providerId);
      }
    } catch (err) {
      console.warn("ensureProviderFreeSubscriptionRow (non-fatal):", err);
    }
  }

  return providerHasActiveSubscription(supabaseAdmin, providerId);
}

export interface BuildOnboardingCompletionOptions {
  supabaseAdmin: SupabaseClient;
  tenantId: string;
  provider: Record<string, unknown>;
  selectedPlanId: string | null | undefined;
  message: string;
  autoApprove?: boolean;
  alreadyCompleted?: boolean;
  autoConfigured?: OnboardingCompletionPayload["auto_configured"];
}

/**
 * Shared completion response for happy-path submit and idempotent retry.
 */
export async function buildOnboardingCompletionResponse(
  options: BuildOnboardingCompletionOptions,
): Promise<OnboardingCompletionPayload> {
  const {
    supabaseAdmin,
    tenantId,
    provider,
    selectedPlanId,
    message,
    autoApprove,
    alreadyCompleted,
    autoConfigured,
  } = options;

  const providerId = String(provider.id ?? "");
  const plan = await resolveSelectedOnboardingPlan(supabaseAdmin, tenantId, selectedPlanId);

  let subscriptionActive = await providerHasActiveSubscription(supabaseAdmin, providerId);

  if (plan.selectedPlanIsFree && !subscriptionActive) {
    subscriptionActive = await ensureSubscriptionForOnboardingCompletion(
      supabaseAdmin,
      providerId,
      tenantId,
      plan,
    );
  }

  let requiresCheckout = Boolean(selectedPlanId && plan.selectedPlanRequiresCheckout);

  if (requiresCheckout && providerId) {
    const hasPaid = await providerHasActivePaidSubscription(supabaseAdmin, providerId);
    if (hasPaid) {
      requiresCheckout = false;
    }
  }

  return {
    provider,
    message,
    auto_approved: autoApprove,
    selected_plan_id: selectedPlanId || null,
    selected_plan_is_free: plan.selectedPlanIsFree,
    selected_subscription_plan_id: plan.selectedSubscriptionPlanId,
    requires_checkout: requiresCheckout,
    checkout_path:
      requiresCheckout && selectedPlanId
        ? `/provider/subscription-checkout?planId=${encodeURIComponent(selectedPlanId)}`
        : null,
    subscription_endpoint: requiresCheckout ? "/api/provider/subscription/initialize-payment" : null,
    subscription_active: subscriptionActive,
    ...(alreadyCompleted ? { already_completed: true } : {}),
    ...(autoConfigured ? { auto_configured: autoConfigured } : {}),
  };
}
