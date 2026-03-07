import { useState } from "react";
import { View } from "react-native";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SegmentTabs } from "@/components/ui/SegmentTabs";
import { RewardsPointsContent } from "./rewards";
import { GamificationBadgesContent } from "./gamification";

const TABS = [
  { key: "points", label: "Points" },
  { key: "badges", label: "Badges" },
];

export default function RewardsHubScreen() {
  const [activeKey, setActiveKey] = useState("points");

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader title="Rewards & badges" showBack subtitle="Points, achievements & milestones" />
      <View style={{ marginBottom: 16 }}>
        <SegmentTabs tabs={TABS} activeKey={activeKey} onSelect={setActiveKey} />
      </View>
      <View style={{ flex: 1, minHeight: 0 }}>
        {activeKey === "points" && <RewardsPointsContent />}
        {activeKey === "badges" && <GamificationBadgesContent />}
      </View>
    </ScreenContainer>
  );
}
