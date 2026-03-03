import { View, Text, TouchableOpacity } from "react-native";
import * as Haptics from "expo-haptics";

export interface SegmentTabItem {
  key: string;
  label: string;
}

interface SegmentTabsProps {
  tabs: SegmentTabItem[];
  activeKey: string;
  onSelect: (key: string) => void;
  className?: string;
}

export function SegmentTabs({ tabs, activeKey, onSelect, className = "" }: SegmentTabsProps) {
  return (
    <View
      className={`flex-row rounded-xl bg-gray-100 p-1 ${className}`}
      style={{ gap: 4 }}
    >
      {tabs.map((tab) => {
        const isActive = activeKey === tab.key;
        return (
          <TouchableOpacity
            key={tab.key}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onSelect(tab.key);
            }}
            activeOpacity={0.7}
            className={`flex-1 items-center justify-center rounded-lg py-2.5 ${
              isActive ? "bg-white shadow-sm" : ""
            }`}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={tab.label}
          >
            <Text
              className={`text-sm font-medium ${
                isActive ? "text-gray-900" : "text-gray-500"
              }`}
              numberOfLines={1}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
