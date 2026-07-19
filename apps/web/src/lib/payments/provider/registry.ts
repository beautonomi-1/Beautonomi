import { getTenantRegionConfig } from "@/lib/regions/config";
import {
  getPrimaryOnlinePaymentGatewayForRegion,
  type RegionOnlineGatewayRow,
} from "@/lib/regions/payment-gateways";
import type { PaymentProvider, SettlementModel } from "./types";
import { paystackProvider } from "./paystack-provider";
import { stripeProvider } from "./stripe-provider";
import { resolveSettlementModel } from "./settlement-model";

export { resolveSettlementModel };

const PROVIDERS: Record<string, PaymentProvider> = {
  paystack: paystackProvider,
  stripe: stripeProvider,
};

export async function getRegionPaymentGateway(
  tenantId: string | null | undefined,
): Promise<(RegionOnlineGatewayRow & { regionId: string }) | null> {
  if (!tenantId) return null;
  const rc = await getTenantRegionConfig(tenantId);
  if (!rc?.regionId) return null;
  const gateway = await getPrimaryOnlinePaymentGatewayForRegion(rc.regionId);
  if (!gateway) return null;
  return { ...gateway, regionId: rc.regionId };
}

export async function getPaymentProviderForTenant(
  tenantId: string | null | undefined,
): Promise<{ provider: PaymentProvider; gateway: RegionOnlineGatewayRow } | null> {
  const row = await getRegionPaymentGateway(tenantId);
  if (!row) return null;
  const provider = PROVIDERS[row.gateway.trim().toLowerCase()];
  if (!provider) return null;
  return { provider, gateway: row };
}

export function getPaymentProviderById(id: string): PaymentProvider | null {
  return PROVIDERS[id.trim().toLowerCase()] ?? null;
}
