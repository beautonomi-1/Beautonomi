import type { SupabaseClient } from "@supabase/supabase-js";
import { getPlatformPaymentTypesForTenant } from "@/lib/payments/platform-payment-types";
import { isOnlineCardEnabledForTenant } from "@/lib/payments/online-payment";
import {
  isGiftCardsEnabledForTenant,
  isWalletEnabledForTenant,
} from "@/lib/subscriptions/entitlements";

export type EffectiveCheckoutMethods = {
  online: boolean;
  cash: boolean;
  giftCard: boolean;
  wallet: boolean;
};

type ProviderAcceptRow = {
  accept_online?: boolean | null;
  accept_cash?: boolean | null;
};

export async function getEffectiveCheckoutMethods(params: {
  supabase: SupabaseClient;
  tenantId: string;
  providerId: string;
}): Promise<EffectiveCheckoutMethods> {
  const { supabase, tenantId, providerId } = params;

  const [paymentTypes, onlineEnabled, giftCardPlatform, walletPlatform, providerRow] =
    await Promise.all([
      getPlatformPaymentTypesForTenant(supabase, tenantId),
      isOnlineCardEnabledForTenant(tenantId),
      isGiftCardsEnabledForTenant(tenantId),
      isWalletEnabledForTenant(tenantId),
      supabase
        .from("providers")
        .select("accept_online, accept_cash")
        .eq("id", providerId)
        .maybeSingle(),
    ]);

  const provider = (providerRow.data ?? {}) as ProviderAcceptRow;
  const acceptOnline = provider.accept_online ?? true;
  const acceptCash = provider.accept_cash ?? true;

  return {
    online: onlineEnabled && acceptOnline && paymentTypes.card !== false,
    cash: paymentTypes.cash === true && acceptCash,
    giftCard: giftCardPlatform,
    wallet: walletPlatform,
  };
}
