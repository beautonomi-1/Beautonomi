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
      <View className="mb-4">
        <SegmentTabs tabs={TABS} activeKey={activeKey} onSelect={setActiveKey} />
      </View>
      <View className="flex-1 min-h-0">
        {activeKey === "blocks" && <TimeBlocksContent />}
        {activeKey === "daysoff" && <DaysOffContent />}
      </View>
    </ScreenContainer>
  );
}
