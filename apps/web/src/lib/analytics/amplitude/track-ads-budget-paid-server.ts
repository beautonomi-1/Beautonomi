import { EVENT_ADS_BUDGET_PAID } from "./types";
import { trackMoneyEventServer } from "./track-money-event-server";

export async function trackAdsBudgetPaidServer(params: {
  reference: string;
  campaignId: string;
  providerId: string;
  amount: number;
  currency?: string | null;
  userId?: string | null;
  /** "saved_card" | "paystack" | "marketing_credit" */
  paymentMethod?: string | null;
  paymentProvider?: string | null;
}): Promise<void> {
  await trackMoneyEventServer(EVENT_ADS_BUDGET_PAID, {
    reference: params.reference,
    amount: params.amount,
    currency: params.currency,
    userId: params.userId,
    portal: "provider",
    paymentMethod: params.paymentMethod,
    paymentProvider: params.paymentProvider ?? "paystack",
    revenueType: "ads_budget",
    productId: params.campaignId,
    properties: { campaign_id: params.campaignId, provider_id: params.providerId },
  });
}
