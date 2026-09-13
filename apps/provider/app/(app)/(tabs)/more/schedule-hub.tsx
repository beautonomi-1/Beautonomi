import { useState } from "react";
import { View, Text } from "react-native";
import { useTranslation } from "@beautonomi/i18n";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SegmentTabs } from "@/components/ui/SegmentTabs";
import { TimeBlocksContent } from "./time-blocks";
import { DaysOffContent } from "./days-off";

export default function ScheduleHubScreen() {
  const { t } = useTranslation();
  const sh = (key: string) => t(`provider.mobile.screens.scheduleHub.${key}`) as string;
  const [activeKey, setActiveKey] = useState("blocks");
  const tabs = [
    { key: "blocks", label: sh("tabBlocks") },
    { key: "daysoff", label: sh("tabDaysOff") },
  ];
  const hints: Record<string, string> = {
    blocks: sh("hintBlocks"),
    daysoff: sh("hintDaysOff"),
  };

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader title={sh("title")} showBack subtitle={sh("subtitle")} />
      <View style={{ marginBottom: 16 }}>
        <SegmentTabs tabs={tabs} activeKey={activeKey} onSelect={setActiveKey} />
      </View>
      <View style={{ backgroundColor: "#FEF3C7", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 12 }}>
        <Text style={{ fontSize: 13, color: "#92400E", lineHeight: 18 }}>
          {hints[activeKey]}
        </Text>
      </View>
      <View style={{ flex: 1, minHeight: 0 }}>
        {activeKey === "blocks" && <TimeBlocksContent />}
        {activeKey === "daysoff" && <DaysOffContent />}
      </View>
    </ScreenContainer>
  );
}
