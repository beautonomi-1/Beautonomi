import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { format, isSameDay } from "date-fns";
import { Colors } from "@/constants/colors";
import { CALENDAR_ACCENT, CALENDAR_DARK_HEADER } from "@/features/calendar/theme/tokens";

interface Props {
  weekDays: Date[];
  selectedDate: Date;
  bookingCountsByDate: Map<string, number>;
  isProviderToday: (d: Date) => boolean;
  calendarDateKey: (d: Date) => string;
  onSelectDay: (d: Date) => void;
  viewMode: "day" | "3day" | "week";
  onSelectViewMode?: (m: "day") => void;
}

export function CalendarDateStrip({
  weekDays,
  selectedDate,
  bookingCountsByDate,
  isProviderToday,
  calendarDateKey,
  onSelectDay,
  viewMode,
  onSelectViewMode,
}: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginTop: 8, paddingHorizontal: 8 }}
      contentContainerStyle={{ flexDirection: "row" }}
    >
      {weekDays.map((day) => {
        const isSelected = isSameDay(day, selectedDate);
        const isToday = isProviderToday(day);
        const count = bookingCountsByDate.get(calendarDateKey(day)) ?? 0;
        return (
          <TouchableOpacity
            key={day.toISOString()}
            style={[
              {
                alignItems: "center",
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 10,
                marginRight: 6,
                minWidth: 52,
                minHeight: 56,
              },
              isSelected
                ? { backgroundColor: CALENDAR_ACCENT }
                : isToday
                  ? { borderWidth: 1.5, borderColor: "rgba(255,255,255,0.6)" }
                  : {},
            ]}
            onPress={() => {
              onSelectDay(day);
              if (viewMode === "week" && onSelectViewMode) onSelectViewMode("day");
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: "600",
                color: isSelected ? CALENDAR_DARK_HEADER : "rgba(255,255,255,0.82)",
              }}
            >
              {format(day, "EEE")}
            </Text>
            <Text
              style={{
                marginTop: 2,
                fontSize: 16,
                fontWeight: "700",
                color: isSelected ? CALENDAR_DARK_HEADER : Colors.white,
              }}
            >
              {format(day, "d")}
            </Text>
            {count > 0 && !isSelected && (
              <View
                style={{
                  marginTop: 4,
                  height: 6,
                  width: 6,
                  borderRadius: 3,
                  backgroundColor: CALENDAR_ACCENT,
                }}
              />
            )}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}
