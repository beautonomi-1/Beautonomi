import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "@beautonomi/i18n";
import { formatMoney } from "@beautonomi/utils";
import { Colors } from "@/constants/colors";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import type { PayableProductOrderRow } from "@/features/shop/usePayableProductOrders";
import { trackPayableOrdersBannerShown, trackPayableOrdersPayClicked } from "@/lib/analytics";

export function PayableOrdersBanner({
  orders,
  complete,
  onRetry,
  context,
  collapse = true,
}: {
  orders: PayableProductOrderRow[];
  complete: boolean;
  onRetry: () => void;
  context: "cart" | "orders";
  collapse?: boolean;
}) {
  const { t } = useTranslation();
  const currencyFallback = getTenantDefaultCurrency();
  const [expanded, setExpanded] = useState(false);
  const shownKeyRef = useRef<string>("");

  const visibleOrders = useMemo(() => {
    if (!collapse || expanded) return orders;
    return orders.length > 0 ? [orders[0]] : [];
  }, [orders, collapse, expanded]);

  const title =
    context === "cart"
      ? (t("customer.mobile.components.payableOrdersBanner.titleCart") as string)
      : (t("customer.mobile.components.payableOrdersBanner.titleOrders") as string);

  const summaryKey =
    orders.length === 1
      ? "customer.mobile.components.payableOrdersBanner.summary_one"
      : "customer.mobile.components.payableOrdersBanner.summary_other";
  const summary = t(summaryKey, { count: orders.length }) as string;

  useEffect(() => {
    if (orders.length === 0) return;
    const key = `${context}:${orders.length}:${complete ? "1" : "0"}`;
    if (shownKeyRef.current === key) return;
    shownKeyRef.current = key;
    trackPayableOrdersBannerShown({ context, count: orders.length, complete });
  }, [orders.length, complete, context]);

  if (orders.length === 0 && complete) return null;

  return (
    <View
      style={{
        marginBottom: 16,
        backgroundColor: "#FFFBEB",
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#FDE68A",
        padding: 12,
      }}
    >
      <Text style={{ fontSize: 13, fontWeight: "700", color: "#92400E", marginBottom: 8 }}>
        {title}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <Text style={{ fontSize: 12, fontWeight: "600", color: "#92400E" }}>{summary}</Text>
        {collapse && orders.length > 1 ? (
          <TouchableOpacity onPress={() => setExpanded((v) => !v)} accessibilityRole="button">
            <Text style={{ fontSize: 12, fontWeight: "700", color: Colors.primary }}>
              {expanded
                ? (t("customer.mobile.components.payableOrdersBanner.showLess") as string)
                : (t("customer.mobile.components.payableOrdersBanner.viewAll") as string)}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {visibleOrders.map((order) => {
        const due = typeof order.amount_still_due === "number" ? order.amount_still_due : 0;
        const amount = formatMoney(due, order.currency || currencyFallback);
        return (
          <View
            key={order.id}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              marginTop: 8,
            }}
          >
            <View style={{ flex: 1 }}>
              {order.provider?.business_name ? (
                <Text style={{ fontSize: 12, color: "#6B7280" }} numberOfLines={1}>
                  {order.provider.business_name}
                </Text>
              ) : null}
              <Text style={{ fontSize: 14, fontWeight: "700", color: "#111827" }}>{order.order_number}</Text>
              <Text style={{ fontSize: 13, color: "#92400E", marginTop: 2 }}>{amount}</Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                trackPayableOrdersPayClicked({
                  context,
                  order_id: order.id,
                  provider_id: order.provider?.id ?? undefined,
                  amount_due: due,
                  currency: order.currency ?? undefined,
                });
                router.push({
                  pathname: "/(app)/product-order-detail",
                  params: { id: order.id, startPay: "1" },
                } as never);
              }}
              style={{
                backgroundColor: Colors.primary,
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 8,
              }}
              accessibilityRole="button"
              accessibilityLabel={t("customer.mobile.screens.productOrderDetail.payOnlineA11y")}
            >
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>
                {t("customer.mobile.screens.productOrderDetail.payOnlineCta", { amount })}
              </Text>
            </TouchableOpacity>
          </View>
        );
      })}
      {!complete ? (
        <TouchableOpacity onPress={onRetry} style={{ marginTop: 10 }}>
          <Text style={{ fontSize: 13, fontWeight: "600", color: Colors.primary }}>
            {t("customer.mobile.components.payableOrdersBanner.retry")}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
