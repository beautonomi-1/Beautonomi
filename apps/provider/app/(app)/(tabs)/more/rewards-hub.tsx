import { useState, useEffect } from "react";
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SegmentTabs } from "@/components/ui/SegmentTabs";
import { RewardsPointsContent } from "./rewards";
import { GamificationBadgesContent } from "./gamification";

const TABS = [
  { key: "points", label: "Points" },
  { key: "badges", label: "Badges" },
];

function tabFromParam(tab: string | string[] | undefined): "points" | "badges" | null {
  const raw = Array.isArray(tab) ? tab[0] : tab;
  if (raw === undefined || raw === "") return null;
  const t = String(raw).toLowerCase();
  if (t === "badges") return "badges";
  if (t === "points") return "points";
  return null;
}

export default function RewardsHubScreen() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const [activeKey, setActiveKey] = useState<"points" | "badges">(() => tabFromParam(params.tab) ?? "points");

  useEffect(() => {
    const next = tabFromParam(params.tab);
    if (next !== null) setActiveKey(next);
  }, [params.tab]);

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader title="Rewards & badges" showBack subtitle="Earn points, unlock levels, grow your profile" />
      <View style={{ marginBottom: 16 }}>
        <SegmentTabs tabs={TABS} activeKey={activeKey} onSelect={(k) => setActiveKey(k as "points" | "badges")} />
      </View>
      <View style={{ flex: 1, minHeight: 0 }}>
        {activeKey === "points" && <RewardsPointsContent />}
        {activeKey === "badges" && <GamificationBadgesContent />}
      </View>
    </ScreenContainer>
  );
}
