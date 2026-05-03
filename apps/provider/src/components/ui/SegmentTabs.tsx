import { View, Text, TouchableOpacity, type ViewStyle } from "react-native";
import * as Haptics from "expo-haptics";

export interface SegmentTabItem {
  key: string;
  label: string;
  /**
   * §Provider-audit 2026-05: optional alert-style badge (e.g. count of orders
   * still needing the provider's action). Rendered as a pink pill next to the
   * label so providers can see at a glance which segment has open work.
   * Omit or pass 0 / null to suppress.
   */
  badgeCount?: number | null;
}

interface SegmentTabsProps {
  tabs: SegmentTabItem[];
  activeKey: string;
  onSelect: (key: string) => void;
  style?: ViewStyle;
}

function formatBadge(count: number | null | undefined): string | null {
  if (!count || count <= 0) return null;
  return count > 99 ? "99+" : String(count);
}

export function SegmentTabs({ tabs, activeKey, onSelect, style: styleProp }: SegmentTabsProps) {
  return (
    <View style={[{ flexDirection: "row", borderRadius: 12, backgroundColor: "#f3f4f6", padding: 4 }, styleProp]}>
      {tabs.map((tab, index) => {
        const isActive = activeKey === tab.key;
        const badge = formatBadge(tab.badgeCount);
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
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 8,
              paddingVertical: 10,
              marginRight: index < tabs.length - 1 ? 4 : 0,
              ...(isActive
                ? { backgroundColor: "#fff", shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 }
                : {}),
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={badge ? `${tab.label}, ${badge} pending` : tab.label}
          >
            <Text
              style={{ fontSize: 14, fontWeight: "500", color: isActive ? "#111827" : "#6b7280" }}
              numberOfLines={1}
            >
              {tab.label}
            </Text>
            {badge ? (
              <View
                style={{
                  marginLeft: 6,
                  minWidth: 18,
                  height: 18,
                  paddingHorizontal: 5,
                  borderRadius: 9,
                  backgroundColor: "#ef4444",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                <Text style={{ fontSize: 10, fontWeight: "700", color: "#fff" }}>{badge}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
