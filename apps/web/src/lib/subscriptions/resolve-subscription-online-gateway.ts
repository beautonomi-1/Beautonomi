import { getPaymentProviderForTenant } from "@/lib/payments/provider/registry";

export type SubscriptionOnlineGatewayId = "paystack" | "stripe" | "other";

/**
 * Primary online gateway for provider subscription checkout (upgrade / initialize-payment).
 * Matches `initializeOnlinePayment` tenant resolution.
 */
export async function resolveSubscriptionOnlineGatewayId(
  tenantId: string | null | undefined,
): Promise<SubscriptionOnlineGatewayId> {
  const psp = await getPaymentProviderForTenant(tenantId);
  if (!psp) return "other";
  const id = psp.provider.id.trim().toLowerCase();
  if (id === "paystack") return "paystack";
  if (id === "stripe") return "stripe";
  return "other";
}

export function subscriptionGatewayUsesPaystackCustomer(
  gateway: SubscriptionOnlineGatewayId,
): boolean {
  return gateway === "paystack";
}
