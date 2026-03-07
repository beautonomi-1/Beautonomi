import { useState } from "react";
import { View } from "react-native";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SegmentTabs } from "@/components/ui/SegmentTabs";
import { TimeBlocksContent } from "./time-blocks";
import { DaysOffContent } from "./days-off";

const TABS = [
  { key: "blocks", label: "Time blocks" },
  { key: "daysoff", label: "Days off" },
];

export default function ScheduleHubScreen() {
  const [activeKey, setActiveKey] = useState("blocks");

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader title="Schedule" showBack subtitle="Time blocks & staff days off" />
      <View style={{ marginBottom: 16 }}>
        <SegmentTabs tabs={TABS} activeKey={activeKey} onSelect={setActiveKey} />
      </View>
      <View style={{ flex: 1, minHeight: 0 }}>
        {activeKey === "blocks" && <TimeBlocksContent />}
        {activeKey === "daysoff" && <DaysOffContent />}
      </View>
    </ScreenContainer>
  );
}
