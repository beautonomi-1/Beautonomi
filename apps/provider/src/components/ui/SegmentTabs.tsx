import { View, Text, TouchableOpacity, type ViewStyle } from "react-native";
import * as Haptics from "expo-haptics";

export interface SegmentTabItem {
  key: string;
  label: string;
}

interface SegmentTabsProps {
  tabs: SegmentTabItem[];
  activeKey: string;
  onSelect: (key: string) => void;
  style?: ViewStyle;
}

export function SegmentTabs({ tabs, activeKey, onSelect, style: styleProp }: SegmentTabsProps) {
  return (
    <View style={[{ flexDirection: "row", borderRadius: 12, backgroundColor: "#f3f4f6", padding: 4 }, styleProp]}>
      {tabs.map((tab, index) => {
        const isActive = activeKey === tab.key;
        return (
          <TouchableOpacity
            key={tab.key}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onSelect(tab.key);
            }}
            activeOpacity={0.7}
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 8,
              paddingVertical: 10,
              marginRight: index < tabs.length - 1 ? 4 : 0,
              ...(isActive ? { backgroundColor: "#fff", shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 } : {}),
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={tab.label}
          >
            <Text
              style={{ fontSize: 14, fontWeight: "500", color: isActive ? "#111827" : "#6b7280" }}
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
