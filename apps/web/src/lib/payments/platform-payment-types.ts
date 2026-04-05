import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchScopedSingle } from "@/lib/tenant/scoped-overrides";

export interface PlatformPaymentTypes {
  cash: boolean;
  card: boolean;
  mobile: boolean;
  gift_card: boolean;
}

const DEFAULT_PAYMENT_TYPES: PlatformPaymentTypes = {
  // Cash is optional on-platform to protect platform fee capture by default.
  cash: false,
  card: true,
  mobile: true,
  gift_card: true,
};

export async function getPlatformPaymentTypesForTenant(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<PlatformPaymentTypes> {
  const scoped = await fetchScopedSingle<Record<string, unknown>>({
    supabase,
    table: "platform_settings",
    tenantId,
    select: "settings",
    apply: (q) => q.eq("is_active", true),
    orderBy: { column: "updated_at", ascending: false },
  });

  const settings = (scoped.data as { settings?: Record<string, unknown> } | null)?.settings;
  const paymentTypes = (settings as Record<string, any> | undefined)
    ?.payment_types as Record<string, unknown> | undefined;

  if (!paymentTypes) return DEFAULT_PAYMENT_TYPES;

  return {
    cash: paymentTypes.cash === true,
    card: paymentTypes.card !== false,
    mobile: paymentTypes.mobile !== false,
    gift_card: paymentTypes.gift_card !== false,
  };
}

