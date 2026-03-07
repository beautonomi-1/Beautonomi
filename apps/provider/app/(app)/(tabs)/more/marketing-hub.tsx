import { useState } from "react";
import { View } from "react-native";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SegmentTabs } from "@/components/ui/SegmentTabs";
import { MarketingCampaignsContent } from "./marketing";
import { PromotionsContent } from "./promotions";

const TABS = [
  { key: "campaigns", label: "Campaigns" },
  { key: "promo", label: "Promo codes" },
];

export default function MarketingHubScreen() {
  const [activeKey, setActiveKey] = useState("campaigns");

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader title="Marketing" showBack subtitle="Campaigns & promo codes" />
      <View style={{ marginBottom: 16 }}>
        <SegmentTabs tabs={TABS} activeKey={activeKey} onSelect={setActiveKey} />
      </View>
      <View style={{ flex: 1, minHeight: 0 }}>
        {activeKey === "campaigns" && <MarketingCampaignsContent />}
        {activeKey === "promo" && <PromotionsContent />}
      </View>
    </ScreenContainer>
  );
}
