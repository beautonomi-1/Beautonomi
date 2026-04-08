import { useState, useEffect } from "react";
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SegmentTabs } from "@/components/ui/SegmentTabs";
import { ProductOrdersContent } from "./product-orders";
import { ProductReturnsContent } from "./product-returns";

const TABS = [
  { key: "orders", label: "Orders" },
  { key: "returns", label: "Returns" },
];

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

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader title="Orders & returns" showBack subtitle="Product orders & refunds" />
      <View style={{ marginBottom: 16 }}>
        <SegmentTabs tabs={TABS} activeKey={activeKey} onSelect={setActiveKey} />
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
