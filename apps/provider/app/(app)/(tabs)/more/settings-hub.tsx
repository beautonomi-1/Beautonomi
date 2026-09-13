import { useState } from "react";
import { View } from "react-native";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SegmentTabs } from "@/components/ui/SegmentTabs";
import { SettingsBusinessContent } from "./_components/settings-content";
import { SubscriptionContent } from "./subscription";
import { BillingHistoryContent } from "./billing-history";
import { useTranslation } from "@beautonomi/i18n";

export default function SettingsHubScreen() {
  const { t } = useTranslation();
  const sh = (key: string) => t(`provider.mobile.screens.settingsHub.${key}`) as string;
  const [activeKey, setActiveKey] = useState("business");
  const tabs = [
    { key: "business", label: sh("tabBusiness") },
    { key: "subscription", label: sh("tabSubscription") },
    { key: "billing", label: sh("tabBilling") },
  ];

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader title={sh("title")} showBack subtitle={sh("subtitle")} />
      <View style={{ marginBottom: 16 }}>
        <SegmentTabs tabs={tabs} activeKey={activeKey} onSelect={setActiveKey} />
      </View>
      <View style={{ flex: 1, minHeight: 0 }}>
        {activeKey === "business" && <SettingsBusinessContent />}
        {activeKey === "subscription" && <SubscriptionContent />}
        {activeKey === "billing" && <BillingHistoryContent />}
      </View>
    </ScreenContainer>
  );
}
