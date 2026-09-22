import { isFeatureEnabledServer } from "@/lib/server/feature-flags";
import { FEATURE_FLAG_KEYS } from "@/lib/server/feature-flag-keys";

export async function isCustomerWhatsAppJourneyEnabled(
  tenantId?: string | null,
): Promise<boolean> {
  return isFeatureEnabledServer(FEATURE_FLAG_KEYS.CUSTOMER_WHATSAPP_JOURNEY, tenantId);
}

export async function isProviderWhatsAppJourneyEnabled(
  tenantId?: string | null,
): Promise<boolean> {
  return isFeatureEnabledServer(FEATURE_FLAG_KEYS.PROVIDER_WHATSAPP_JOURNEY, tenantId);
}
