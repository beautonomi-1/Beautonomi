import type { SupabaseClient } from "@supabase/supabase-js";
import { getPaymentProviderForTenant } from "@/lib/payments/provider/registry";
import { getStripeClient } from "@/lib/payments/stripe-server";

export type PayoutRail = "paystack" | "stripe";

export type StripeConnectPayoutStatus = {
  connect_account_id: string | null;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  /** True when Connect reports charges and payouts enabled (full payout E2E readiness). */
  onboarding_complete: boolean;
  currently_due: string[];
  disabled_reason: string | null;
  external_account_last4: string | null;
};

export type ProviderPayoutRailContext = {
  payout_rail: PayoutRail;
  stripe_connect: StripeConnectPayoutStatus | null;
};

export async function resolvePayoutRailForTenant(
  tenantId: string | null | undefined,
): Promise<PayoutRail | null> {
  const psp = await getPaymentProviderForTenant(tenantId);
  if (!psp) return null;
  if (psp.provider.id === "stripe") return "stripe";
  if (psp.provider.id === "paystack") return "paystack";
  return null;
}

export async function retrieveStripeConnectPayoutStatus(
  tenantId: string,
  connectAccountId: string | null | undefined,
): Promise<StripeConnectPayoutStatus> {
  const empty: StripeConnectPayoutStatus = {
    connect_account_id: connectAccountId?.trim() || null,
    charges_enabled: false,
    payouts_enabled: false,
    details_submitted: false,
    onboarding_complete: false,
    currently_due: [],
    disabled_reason: null,
    external_account_last4: null,
  };
  if (!connectAccountId?.trim()) return empty;

  try {
    const stripe = await getStripeClient(tenantId);
    const account = await stripe.accounts.retrieve(connectAccountId.trim());
    const currentlyDue = account.requirements?.currently_due ?? [];
    const payoutsEnabled = Boolean(account.payouts_enabled);
    const chargesEnabled = Boolean(account.charges_enabled);
    const detailsSubmitted = Boolean(account.details_submitted);
    const externalAccounts = account.external_accounts?.data ?? [];
    const bank = externalAccounts.find((e) => e.object === "bank_account") as
      | { last4?: string }
      | undefined;

    return {
      connect_account_id: account.id,
      charges_enabled: chargesEnabled,
      payouts_enabled: payoutsEnabled,
      details_submitted: detailsSubmitted,
      onboarding_complete: payoutsEnabled && chargesEnabled,
      currently_due: currentlyDue,
      disabled_reason:
        typeof account.requirements?.disabled_reason === "string"
          ? account.requirements.disabled_reason
          : null,
      external_account_last4: bank?.last4 ?? null,
    };
  } catch (err) {
    console.error("[payout-rail] stripe.accounts.retrieve failed:", err);
    return { ...empty, connect_account_id: connectAccountId.trim() };
  }
}

export async function loadProviderPayoutRailContext(
  supabase: SupabaseClient,
  providerId: string,
  tenantId: string | null,
): Promise<ProviderPayoutRailContext | null> {
  const { data: provider } = await supabase
    .from("providers")
    .select("stripe_connect_account_id, tenant_id")
    .eq("id", providerId)
    .maybeSingle();

  const effectiveTenantId =
    (provider as { tenant_id?: string | null } | null)?.tenant_id ?? tenantId;
  const rail = await resolvePayoutRailForTenant(effectiveTenantId);
  if (!rail) return null;

  if (rail === "paystack") {
    return { payout_rail: "paystack", stripe_connect: null };
  }

  const connectId = (provider as { stripe_connect_account_id?: string | null } | null)
    ?.stripe_connect_account_id;

  if (!effectiveTenantId) {
    return {
      payout_rail: "stripe",
      stripe_connect: {
        connect_account_id: connectId ?? null,
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: false,
        onboarding_complete: false,
        currently_due: [],
        disabled_reason: null,
        external_account_last4: null,
      },
    };
  }

  const stripe_connect = await retrieveStripeConnectPayoutStatus(effectiveTenantId, connectId);
  return { payout_rail: "stripe", stripe_connect };
}

export function isProviderPayoutDestinationReady(ctx: ProviderPayoutRailContext): boolean {
  if (ctx.payout_rail === "paystack") return true;
  return Boolean(ctx.stripe_connect?.onboarding_complete && ctx.stripe_connect.connect_account_id);
}
