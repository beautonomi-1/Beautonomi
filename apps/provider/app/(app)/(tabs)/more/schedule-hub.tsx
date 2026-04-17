import { useState } from "react";
import { View, Text } from "react-native";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SegmentTabs } from "@/components/ui/SegmentTabs";
import { TimeBlocksContent } from "./time-blocks";
import { DaysOffContent } from "./days-off";

const TABS = [
  { key: "blocks", label: "Time blocks" },
  { key: "daysoff", label: "Days off" },
];

const HINTS: Record<string, string> = {
  blocks: "Time blocks prevent bookings during specific periods (e.g. lunch, meetings). Recurring blocks repeat weekly.",
  daysoff: "Days off fully block a staff member\u2019s availability for the entire day. Use time blocks for partial-day blocks.",
};

export default function ScheduleHubScreen() {
  const [activeKey, setActiveKey] = useState("blocks");

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader title="Schedule" showBack subtitle="Time blocks & staff days off" />
      <View style={{ marginBottom: 16 }}>
        <SegmentTabs tabs={TABS} activeKey={activeKey} onSelect={setActiveKey} />
      </View>
      <View style={{ backgroundColor: "#FEF3C7", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 12 }}>
        <Text style={{ fontSize: 13, color: "#92400E", lineHeight: 18 }}>
          {HINTS[activeKey]}
        </Text>
      </View>
      <View style={{ flex: 1, minHeight: 0 }}>
        {activeKey === "blocks" && <TimeBlocksContent />}
        {activeKey === "daysoff" && <DaysOffContent />}
      </View>
    </ScreenContainer>
  );
}
