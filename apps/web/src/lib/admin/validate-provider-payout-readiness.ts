import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchScopedSingle } from "@/lib/tenant/scoped-overrides";
import { getAvailablePayoutBalance } from "@/lib/provider/available-payout-balance";

export type AdminPayoutAccount = {
  id?: string;
  recipient_code: string;
  currency?: string | null;
};

export type AdminPayoutReadinessResult =
  | {
      ok: true;
      account: AdminPayoutAccount | null;
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

  const account = await resolveActivePayoutAccount(supabase, providerId, requestedAccountId);
  if (requireAccount && !account?.recipient_code) {
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
    };
  }

  return { ok: true, account, availableBalance, rawBalance, holdDays };
}
