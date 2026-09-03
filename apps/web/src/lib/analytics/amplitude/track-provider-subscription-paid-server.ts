import { EVENT_PROVIDER_SUBSCRIPTION_PAID } from "./types";
import { trackMoneyEventServer } from "./track-money-event-server";

export async function trackProviderSubscriptionPaidServer(params: {
  reference: string;
  subscriptionId: string;
  planId?: string | null;
  providerId: string;
  amount: number;
  currency?: string | null;
  /** Provider owner user id (Amplitude user). */
  userId?: string | null;
  paymentMethod?: string | null;
  paymentProvider?: string | null;
  billingCycle?: string | null;
}): Promise<void> {
  await trackMoneyEventServer(EVENT_PROVIDER_SUBSCRIPTION_PAID, {
    reference: params.reference,
    amount: params.amount,
    currency: params.currency,
    userId: params.userId,
    portal: "provider",
    paymentMethod: params.paymentMethod,
    paymentProvider: params.paymentProvider ?? "paystack",
    revenueType: "provider_subscription",
    productId: params.planId ?? params.subscriptionId,
    properties: {
      subscription_id: params.subscriptionId,
      plan_id: params.planId ?? undefined,
      provider_id: params.providerId,
      billing_cycle: params.billingCycle ?? undefined,
    },
  });
}
