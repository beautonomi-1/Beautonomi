import { useState, useEffect, useMemo } from "react";
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SegmentTabs, type SegmentTabItem } from "@/components/ui/SegmentTabs";
import { useApi } from "@/hooks/useApi";
import { ProductOrdersContent } from "./product-orders";
import { ProductReturnsContent } from "./product-returns";

/**
 * §Provider-audit 2026-05: surface the same nav counters used by the More
 * menu badge on the segment tabs themselves so providers immediately see
 * which side has open work without having to switch tabs to find out.
 */
type ProviderNavCounts = {
  active_product_orders?: number;
  open_return_requests?: number;
};

function firstParam(v: string | string[] | undefined): string | undefined {
  if (v == null) return undefined;
  return typeof v === "string" ? v : v[0];
}

export default function OrdersHubScreen() {
  const params = useLocalSearchParams<{ order?: string | string[]; tab?: string | string[] }>();
  const deepLinkOrderId = firstParam(params.order);
  const tabParam = firstParam(params.tab);
  const [activeKey, setActiveKey] = useState(
    tabParam === "returns" ? "returns" : "orders",
  );

  useEffect(() => {
    if (tabParam === "returns") setActiveKey("returns");
  }, [tabParam]);

  // Pull lightweight counts from the same endpoint the More menu badge uses.
  // Short stale time so the counters react quickly when a new order arrives.
  const { data: navCounts } = useApi<ProviderNavCounts>("/api/provider/nav-counts", {
    staleTimeMs: 15_000,
  });

  const tabs = useMemo<SegmentTabItem[]>(
    () => [
      { key: "orders", label: "Orders", badgeCount: navCounts?.active_product_orders ?? 0 },
      { key: "returns", label: "Returns", badgeCount: navCounts?.open_return_requests ?? 0 },
    ],
    [navCounts?.active_product_orders, navCounts?.open_return_requests],
  );

  const totalNeedAction =
    Number(navCounts?.active_product_orders ?? 0) +
    Number(navCounts?.open_return_requests ?? 0);

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title="Orders & returns"
        showBack
        subtitle={
          totalNeedAction > 0
            ? `${totalNeedAction} ${totalNeedAction === 1 ? "item needs" : "items need"} your action`
            : "Product orders & refunds"
        }
      />
      <View style={{ marginBottom: 16 }}>
        <SegmentTabs tabs={tabs} activeKey={activeKey} onSelect={setActiveKey} />
      </View>
      <View style={{ flex: 1, minHeight: 0 }}>
        {activeKey === "orders" && (
          <ProductOrdersContent deepLinkOrderId={deepLinkOrderId} />
        )}
        {activeKey === "returns" && <ProductReturnsContent />}
      </View>
    </ScreenContainer>
  );
}
