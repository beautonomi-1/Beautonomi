import { useState, useEffect } from "react";
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useTranslation } from "@beautonomi/i18n";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SegmentTabs } from "@/components/ui/SegmentTabs";
import { RewardsPointsContent } from "./rewards";
import { GamificationBadgesContent } from "./gamification";

function tabFromParam(tab: string | string[] | undefined): "points" | "badges" | null {
  const raw = Array.isArray(tab) ? tab[0] : tab;
  if (raw === undefined || raw === "") return null;
  const t = String(raw).toLowerCase();
  if (t === "badges") return "badges";
  if (t === "points") return "points";
  return null;
}

export default function RewardsHubScreen() {
  const { t } = useTranslation();
  const rh = (key: string) => t(`provider.mobile.screens.rewardsHub.${key}`) as string;
  const params = useLocalSearchParams<{ tab?: string }>();
  const [activeKey, setActiveKey] = useState<"points" | "badges">(() => tabFromParam(params.tab) ?? "points");

  useEffect(() => {
    const next = tabFromParam(params.tab);
    if (next !== null) setActiveKey(next);
  }, [params.tab]);

  const tabs = [
    { key: "points", label: rh("tabPoints") },
    { key: "badges", label: rh("tabBadges") },
  ];

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader title={rh("title")} showBack subtitle={rh("subtitle")} />
      <View style={{ marginBottom: 16 }}>
        <SegmentTabs tabs={tabs} activeKey={activeKey} onSelect={(k) => setActiveKey(k as "points" | "badges")} />
      </View>
      <View style={{ flex: 1, minHeight: 0 }}>
        {activeKey === "points" && <RewardsPointsContent />}
        {activeKey === "badges" && <GamificationBadgesContent />}
      </View>
    </ScreenContainer>
  );
}
