/**
 * Entitlements — how **tenant flags**, **subscription plan JSON**, and **roles** combine.
 *
 * **Precedence (highest first):**
 * 1. **Superadmin** — full access where explicitly checked (e.g. reports in `report-gating.ts`).
 * 2. **Tenant `feature_flags`** — `isFeatureEnabledServer(key, tenantId)`; tenant row overrides global (`tenant_id` null).
 * 3. **Subscription plan `subscription_plans.features`** — JSON blobs; interpreted by `feature-access.ts` (`getProviderSubscriptionTier`, `check*FeatureAccess`).
 *
 * Payment routes should gate on **(2)** for market-wide killswitches (Paystack, wallet, gift cards).
 * Provider product limits (staff, locations, analytics) use **(3)** via `feature-access.ts`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isFeatureEnabledServer,
  checkMultipleFeaturesServer,
} from "@/lib/server/feature-flags";
import { FEATURE_FLAG_KEYS } from "@/lib/server/feature-flag-keys";

export async function isUserSuperadmin(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "superadmin")
    .maybeSingle();
  return Boolean(data);
}

/** Paystack card payments allowed for this tenant (DB feature_flags + global default). */
export async function isPaystackEnabledForTenant(tenantId: string | null | undefined) {
  return isFeatureEnabledServer(FEATURE_FLAG_KEYS.PAYMENT_PAYSTACK, tenantId);
}

/** Wallet debit/credit for checkout allowed for this tenant. */
export async function isWalletEnabledForTenant(tenantId: string | null | undefined) {
  return isFeatureEnabledServer(FEATURE_FLAG_KEYS.PAYMENT_WALLET, tenantId);
}

/** Gift card purchase/redeem flows allowed for this tenant. */
export async function isGiftCardsEnabledForTenant(tenantId: string | null | undefined) {
  return isFeatureEnabledServer(FEATURE_FLAG_KEYS.GIFT_CARDS, tenantId);
}

/** All payment-related flags in one round-trip. */
export async function getPaymentFeatureFlagsForTenant(
  tenantId: string | null | undefined,
): Promise<{
  payment_paystack: boolean;
  payment_wallet: boolean;
  gift_cards: boolean;
}> {
  const keys = [
    FEATURE_FLAG_KEYS.PAYMENT_PAYSTACK,
    FEATURE_FLAG_KEYS.PAYMENT_WALLET,
    FEATURE_FLAG_KEYS.GIFT_CARDS,
  ] as const;
  const m = await checkMultipleFeaturesServer([...keys], tenantId);
  return {
    payment_paystack: m[FEATURE_FLAG_KEYS.PAYMENT_PAYSTACK] ?? false,
    payment_wallet: m[FEATURE_FLAG_KEYS.PAYMENT_WALLET] ?? false,
    gift_cards: m[FEATURE_FLAG_KEYS.GIFT_CARDS] ?? false,
  };
}
