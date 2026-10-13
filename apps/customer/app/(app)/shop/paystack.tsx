/**
 * Paystack redirect target for shop / product-order payments.
 * Deep-link URL: `ExpoLinking.createURL("shop/paystack")`.
 */
import { PaystackReturnScreen } from "@/components/payment/PaystackReturnScreen";
import { emitCartUpdated } from "@/lib/cart-events";
import type { RouteTarget } from "@/lib/payments/resolvePaystackVerifyRoute";
import { useTranslation } from "@beautonomi/i18n";
import { useMemo } from "react";

function resolveShopTarget(verifyData: unknown): RouteTarget | null {
  let cur: unknown = verifyData;
  for (let depth = 0; depth < 5 && cur && typeof cur === "object"; depth++) {
    const o = cur as Record<string, unknown>;
    const orderId =
      (typeof o.productOrderId === "string" && o.productOrderId.trim()) ||
      (typeof o.product_order_id === "string" && o.product_order_id.trim());
    if (orderId) {
      return { pathname: "/(app)/product-order-detail", params: { id: orderId } };
    }
    cur = o.data;
  }
  return null;
}

const CANCELLED_ROUTE: RouteTarget = { pathname: "/(app)/(tabs)/cart" };
const FALLBACK_ROUTE: RouteTarget = { pathname: "/(app)/product-orders" };

export default function ShopPaystackReturnScreen() {
  const { t } = useTranslation();
  const pr = (key: string) =>
    t(`customer.mobile.components.paystackReturn.${key}`) as string;
  const labels = useMemo(
    () => ({
      verifying: pr("shopVerifying"),
      returning: pr("shopReturning"),
      fallbackCta: pr("shopFallbackCta"),
      continueCta: pr("shopContinueCta"),
    }),
    [t],
  );

  return (
    <PaystackReturnScreen
      resolveTarget={resolveShopTarget}
      cancelledRoute={CANCELLED_ROUTE}
      fallbackRoute={FALLBACK_ROUTE}
      onSuccess={emitCartUpdated}
      labels={labels}
      pendingSubtext={pr("shopPendingSubtext")}
      failedSubtext={pr("shopFailedSubtext")}
    />
  );
}
