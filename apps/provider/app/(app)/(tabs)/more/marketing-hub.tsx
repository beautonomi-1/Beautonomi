import { useMemo, useState } from "react";
import { View } from "react-native";
import { useTranslation } from "@beautonomi/i18n";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SegmentTabs } from "@/components/ui/SegmentTabs";
import { MarketingCampaignsContent } from "./marketing";
import { PromotionsContent } from "./promotions";

export default function MarketingHubScreen() {
  const { t } = useTranslation();
  const mh = (key: string) => t(`provider.mobile.screens.marketingHub.${key}`) as string;
  const [activeKey, setActiveKey] = useState("campaigns");
  const tabs = useMemo(
    () => [
      { key: "campaigns", label: mh("tabCampaigns") },
      { key: "promo", label: mh("tabPromo") },
    ],
    [t],
  );

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader title={mh("title")} showBack subtitle={mh("subtitle")} />
      <View style={{ marginBottom: 16 }}>
        <SegmentTabs tabs={tabs} activeKey={activeKey} onSelect={setActiveKey} />
      </View>
      <View style={{ flex: 1, minHeight: 0 }}>
        {activeKey === "campaigns" && <MarketingCampaignsContent />}
        {activeKey === "promo" && <PromotionsContent />}
      </View>
    </ScreenContainer>
  );
}
