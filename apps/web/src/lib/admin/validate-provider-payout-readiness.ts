import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchScopedSingle } from "@/lib/tenant/scoped-overrides";
import { getAvailablePayoutBalance } from "@/lib/provider/available-payout-balance";
import { getActiveProviderPayoutHold } from "@/lib/fraud/provider-payout-hold";
import {
  loadProviderPayoutRailContext,
  type PayoutRail,
  type StripeConnectPayoutStatus,
} from "@/lib/payments/payout-rail";

export type AdminPayoutAccount = {
  id?: string;
  recipient_code: string;
  currency?: string | null;
};

export type AdminPayoutReadinessResult =
  | {
      ok: true;
      account: AdminPayoutAccount | null;
      payout_rail: PayoutRail;
      stripe_connect: StripeConnectPayoutStatus | null;
      availableBalance: number;
      rawBalance: number;
      holdDays: number;
    }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      availableBalance?: number;
      rawBalance?: number;
      holdDays?: number;
      payout_rail?: PayoutRail;
    };

async function getPayoutHoldDays(supabase: SupabaseClient, tenantId: string | null): Promise<number> {
  const scopedSettings = await fetchScopedSingle<Record<string, unknown>>({
    supabase: supabase as never,
    table: "platform_settings",
    tenantId,
    select: "settings",
    apply: (q) => q.eq("is_active", true),
    orderBy: { column: "updated_at", ascending: false },
  });
  const settings = (scopedSettings.data as { settings?: { payouts?: Record<string, unknown> } } | null)?.settings;
  const payoutSettings = settings?.payouts ?? {};

  return Number(payoutSettings.payout_hold_days ?? 0);
}

export async function resolveActivePayoutAccount(
  supabase: SupabaseClient,
  providerId: string,
  requestedAccountId?: string | null,
): Promise<AdminPayoutAccount | null> {
  if (requestedAccountId) {
    const { data } = await supabase
      .from("provider_payout_accounts")
      .select("id, recipient_code, currency")
      .eq("id", requestedAccountId)
      .eq("provider_id", providerId)
      .eq("active", true)
      .is("deleted_at", null)
      .maybeSingle();

    return data?.recipient_code ? (data as AdminPayoutAccount) : null;
  }

  const { data } = await supabase
    .from("provider_payout_accounts")
    .select("id, recipient_code, currency")
    .eq("provider_id", providerId)
    .eq("active", true)
    .is("deleted_at", null)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.recipient_code ? (data as AdminPayoutAccount) : null;
}

export async function validateAdminPayoutReadiness(params: {
  supabase: SupabaseClient;
  providerId: string;
  tenantId: string | null;
  requestedAccountId?: string | null;
  requireAccount?: boolean;
}): Promise<AdminPayoutReadinessResult> {
  const { supabase, providerId, tenantId, requestedAccountId, requireAccount = false } = params;

  const adminHold = await getActiveProviderPayoutHold(supabase, providerId);
  if (adminHold) {
    return {
      ok: false,
      status: 409,
      code: "PAYOUT_HELD",
      message: adminHold.fraud_case_id
        ? `Payouts are held for this provider (fraud case ${adminHold.fraud_case_id.slice(0, 8)}…). Release the hold in Trust → Fraud cases before processing payouts.`
        : "Payouts are held for this provider by Trust & Safety. Release the hold before processing payouts.",
    };
  }

  const holdDays = await getPayoutHoldDays(supabase, tenantId);
  const { availableBalance, rawBalance, hasNegativeBalance } = await getAvailablePayoutBalance(
    supabase,
    providerId,
    { holdDays, tenantId },
  );

  if (hasNegativeBalance) {
    return {
      ok: false,
      status: 409,
      code: "PAYOUT_BALANCE_DRIFT",
      message:
        "This payout can no longer be processed because the provider's ledger balance is under reconciliation. Review refunds, adjustments, and pending payouts before retrying.",
      availableBalance,
      rawBalance,
      holdDays,
    };
  }

  const railContext = await loadProviderPayoutRailContext(supabase, providerId, tenantId);
  const payout_rail: PayoutRail = railContext?.payout_rail ?? "paystack";
  const stripe_connect = railContext?.stripe_connect ?? null;

  const account = await resolveActivePayoutAccount(supabase, providerId, requestedAccountId);

  if (requireAccount && payout_rail === "stripe") {
    if (!stripe_connect?.connect_account_id?.trim()) {
      return {
        ok: false,
        status: 409,
        code: "STRIPE_CONNECT_REQUIRED",
        message:
          "Provider has not started Stripe Connect onboarding. Ask them to complete payout setup under Settings → Payout accounts.",
        availableBalance,
        rawBalance,
        holdDays,
        payout_rail,
      };
    }
    if (!stripe_connect.onboarding_complete) {
      return {
        ok: false,
        status: 409,
        code: "STRIPE_CONNECT_NOT_READY",
        message:
          "Provider Stripe Connect account is not ready for payouts. They must finish onboarding in Stripe before you can transfer.",
        availableBalance,
        rawBalance,
        holdDays,
        payout_rail,
      };
    }
  } else if (requireAccount && !account?.recipient_code) {
    return {
      ok: false,
      status: 409,
      code: "PAYOUT_ACCOUNT_NOT_READY",
      message:
        requestedAccountId
          ? "The selected payout account is no longer active for this provider. Ask the provider to choose an active payout account or update the request."
          : "Provider payout account not set. Ask the provider to add an active payout account before processing this payout.",
      availableBalance,
      rawBalance,
      holdDays,
      payout_rail,
    };
  }

  return {
    ok: true,
    account: payout_rail === "stripe" ? null : account,
    payout_rail,
    stripe_connect,
    availableBalance,
    rawBalance,
    holdDays,
  };
}
