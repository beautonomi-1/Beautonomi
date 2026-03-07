import { useState } from "react";
import { View } from "react-native";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SegmentTabs } from "@/components/ui/SegmentTabs";
import { ProductOrdersContent } from "./product-orders";
import { ProductReturnsContent } from "./product-returns";

const TABS = [
  { key: "orders", label: "Orders" },
  { key: "returns", label: "Returns" },
];

export default function OrdersHubScreen() {
  const [activeKey, setActiveKey] = useState("orders");

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader title="Orders & returns" showBack subtitle="Product orders & refunds" />
      <View style={{ marginBottom: 16 }}>
        <SegmentTabs tabs={TABS} activeKey={activeKey} onSelect={setActiveKey} />
      </View>
      <View style={{ flex: 1, minHeight: 0 }}>
        {activeKey === "orders" && <ProductOrdersContent />}
        {activeKey === "returns" && <ProductReturnsContent />}
      </View>
    </ScreenContainer>
  );
}
