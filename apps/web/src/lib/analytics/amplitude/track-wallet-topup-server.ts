import { EVENT_WALLET_TOPUP } from "./types";
import { trackMoneyEventServer } from "./track-money-event-server";

export async function trackWalletTopupServer(params: {
  reference: string;
  walletId?: string | null;
  amount: number;
  currency?: string | null;
  customerId?: string | null;
  paymentMethod?: string | null;
  paymentProvider?: string | null;
}): Promise<void> {
  await trackMoneyEventServer(EVENT_WALLET_TOPUP, {
    reference: params.reference,
    amount: params.amount,
    currency: params.currency,
    userId: params.customerId,
    paymentMethod: params.paymentMethod,
    paymentProvider: params.paymentProvider ?? "paystack",
    revenueType: "wallet_topup",
    productId: params.walletId ?? undefined,
    properties: { wallet_id: params.walletId ?? undefined },
  });
}
