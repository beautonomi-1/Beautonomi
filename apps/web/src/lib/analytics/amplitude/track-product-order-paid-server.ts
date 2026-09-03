import { EVENT_PRODUCT_ORDER_PAID } from "./types";
import { trackMoneyEventServer } from "./track-money-event-server";

export async function trackProductOrderPaidServer(params: {
  reference: string;
  orderId: string;
  amount: number;
  currency?: string | null;
  customerId?: string | null;
  providerId?: string | null;
  itemCount?: number | null;
  paymentMethod?: string | null;
  paymentProvider?: string | null;
}): Promise<void> {
  await trackMoneyEventServer(EVENT_PRODUCT_ORDER_PAID, {
    reference: params.reference,
    amount: params.amount,
    currency: params.currency,
    userId: params.customerId,
    paymentMethod: params.paymentMethod,
    paymentProvider: params.paymentProvider ?? "paystack",
    revenueType: "product_order",
    productId: params.orderId,
    quantity: params.itemCount && params.itemCount > 0 ? params.itemCount : 1,
    properties: {
      order_id: params.orderId,
      provider_id: params.providerId ?? undefined,
      item_count: params.itemCount ?? undefined,
    },
  });
}
