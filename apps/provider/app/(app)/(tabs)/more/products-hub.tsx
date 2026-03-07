import { useState } from "react";
import { View } from "react-native";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SegmentTabs } from "@/components/ui/SegmentTabs";
import { ProductsContent } from "./products";
import { InventoryContent } from "./inventory";

const TABS = [
  { key: "products", label: "Products" },
  { key: "inventory", label: "Inventory" },
];

export default function ProductsHubScreen() {
  const [activeKey, setActiveKey] = useState("products");

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader title="Products" showBack subtitle="Catalog & inventory" />
      <View style={{ marginBottom: 16 }}>
        <SegmentTabs tabs={TABS} activeKey={activeKey} onSelect={setActiveKey} />
      </View>
      <View style={{ flex: 1, minHeight: 0 }}>
        {activeKey === "products" && <ProductsContent />}
        {activeKey === "inventory" && <InventoryContent />}
      </View>
    </ScreenContainer>
  );
}
