import { useState } from "react";
import { View } from "react-native";
import { useTranslation } from "@beautonomi/i18n";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SegmentTabs } from "@/components/ui/SegmentTabs";
import { ProductsContent } from "./products";
import { InventoryContent } from "./inventory";

export default function ProductsHubScreen() {
  const { t } = useTranslation();
  const ph = (key: string) => t(`provider.mobile.screens.productsHub.${key}`) as string;
  const [activeKey, setActiveKey] = useState("products");
  const tabs = [
    { key: "products", label: ph("tabProducts") },
    { key: "inventory", label: ph("tabInventory") },
  ];

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader title={ph("title")} showBack subtitle={ph("subtitle")} />
      <View style={{ marginBottom: 16 }}>
        <SegmentTabs tabs={tabs} activeKey={activeKey} onSelect={setActiveKey} />
      </View>
      <View style={{ flex: 1, minHeight: 0 }}>
        {activeKey === "products" && <ProductsContent />}
        {activeKey === "inventory" && <InventoryContent />}
      </View>
    </ScreenContainer>
  );
}
