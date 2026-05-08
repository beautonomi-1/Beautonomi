import { View, Text, TouchableOpacity } from "react-native";
import { Colors } from "@/constants/colors";
import type { CalendarViewMode } from "@/features/calendar/types/calendar";

interface Props {
  viewMode: CalendarViewMode;
  onSelect: (mode: CalendarViewMode) => void;
}

const MODES: { key: CalendarViewMode; label: string }[] = [
  { key: "day", label: "Day" },
  { key: "3day", label: "3 Day" },
  { key: "week", label: "Week" },
];

export function CalendarViewSwitcher({ viewMode, onSelect }: Props) {
  return (
    <View
      style={{
        flexDirection: "row",
        borderRadius: 8,
        padding: 2,
        backgroundColor: "rgba(255,255,255,0.1)",
      }}
    >
      {MODES.map((m) => {
        const active = viewMode === m.key;
        return (
          <TouchableOpacity
            key={m.key}
            style={{
              borderRadius: 6,
              paddingHorizontal: 12,
              paddingVertical: 6,
              backgroundColor: active ? Colors.white : "transparent",
            }}
            onPress={() => onSelect(m.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: "600",
                color: active ? Colors.gray[900] : "rgba(255,255,255,0.7)",
              }}
            >
              {m.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
