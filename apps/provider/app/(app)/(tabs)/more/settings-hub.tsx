import { useState } from "react";
import { View } from "react-native";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SegmentTabs } from "@/components/ui/SegmentTabs";
import { SettingsBusinessContent } from "./_components/settings-content";
import { SubscriptionContent } from "./subscription";
import { BillingHistoryContent } from "./billing-history";

const TABS = [
  { key: "business", label: "Business" },
  { key: "subscription", label: "Subscription" },
  { key: "billing", label: "Billing" },
];

export default function SettingsHubScreen() {
  const [activeKey, setActiveKey] = useState("business");

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader title="Settings" showBack subtitle="Business, plan & billing" />
      <View className="mb-4">
        <SegmentTabs tabs={TABS} activeKey={activeKey} onSelect={setActiveKey} />
      </View>
      <View className="flex-1 min-h-0">
        {activeKey === "business" && <SettingsBusinessContent />}
        {activeKey === "subscription" && <SubscriptionContent />}
        {activeKey === "billing" && <BillingHistoryContent />}
      </View>
    </ScreenContainer>
  );
}
