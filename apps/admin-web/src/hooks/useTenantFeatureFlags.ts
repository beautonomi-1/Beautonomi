import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";

/** Keys aligned with `apps/web/src/lib/server/feature-flag-keys.ts` and DB `feature_flags.feature_key`. */
export const TENANT_PAYMENT_FEATURE_KEYS = {
  GIFT_CARDS: "gift_cards",
  PAYMENT_WALLET: "payment_wallet",
  PAYMENT_PAYSTACK: "payment_paystack",
} as const;

type CheckResponse = { features: Record<string, boolean> };

/**
 * Resolved feature flags for the current request host / admin tenant (same logic as customer-facing checks).
 */
export function useTenantFeatureFlags(keys: readonly string[], queryEnabled = true) {
  return useQuery({
    queryKey: [...adminQueryKeys.root, "tenant-feature-flags", ...keys],
    queryFn: () =>
      adminApi.postJson<CheckResponse>("/api/feature-flags/check", { keys: [...keys] }, { timeoutMs: 30_000 }),
    enabled: queryEnabled && keys.length > 0,
    staleTime: 60_000,
  });
}
