import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { addDays, format, isSameDay } from "date-fns";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { SegmentTabs } from "@/components/ui/SegmentTabs";
import { CalendarHeroSummary } from "@/features/calendar/components/hero/CalendarHeroSummary";
import { CalendarQuickActions } from "@/features/calendar/components/hero/CalendarQuickActions";
import { CALENDAR_ACCENT, CALENDAR_BG, CALENDAR_DARK_HEADER } from "@/features/calendar/theme/tokens";
import type { CalendarV2ChromeContext, CalendarV2Segment } from "@/features/calendar/types/calendar";
import { formatDateKeyInTimeZone } from "@beautonomi/utils";
import { parseCalendarDateParam } from "@/lib/calendar-parse";

function CalendarV2NavBar({ ctx }: { ctx: CalendarV2ChromeContext }) {
  const tz = ctx.providerTimezone;
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(ctx.weekStart, i));

  return (
    <View style={{ backgroundColor: CALENDAR_DARK_HEADER, paddingBottom: 10, paddingTop: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16 }}>
        <TouchableOpacity
          onPress={() => ctx.navigateDate(-1)}
          hitSlop={8}
          style={{ minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center" }}
          accessibilityLabel="Previous day or range"
        >
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={ctx.onOpenDatePicker}
          style={{ flexDirection: "row", alignItems: "center", flex: 1, justifyContent: "center" }}
          accessibilityLabel="Choose date"
        >
          <Text style={{ fontSize: 17, fontWeight: "700", color: Colors.white }} numberOfLines={1}>
            {ctx.viewMode === "week"
              ? `${format(ctx.weekStart, "MMM d")} – ${format(addDays(ctx.weekStart, 6), "MMM d")}`
              : ctx.viewMode === "3day"
                ? `${format(ctx.selectedDate, "MMM d")} – ${format(addDays(ctx.selectedDate, 2), "MMM d")}`
                : format(ctx.selectedDate, "EEE, MMM d")}
          </Text>
        </TouchableOpacity>

        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <TouchableOpacity
            onPress={ctx.onOpenUtilityMenu}
            hitSlop={8}
            style={{ minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center", marginRight: 4 }}
            accessibilityLabel="Calendar actions"
          >
            <Ionicons name="ellipsis-horizontal" size={22} color="rgba(255,255,255,0.85)" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={ctx.onOpenPreferences}
            hitSlop={8}
            style={{ minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center", marginRight: 4 }}
            accessibilityLabel="Calendar preferences"
          >
            <Ionicons name="settings-outline" size={20} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => ctx.navigateDate(1)}
            hitSlop={8}
            style={{ minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center" }}
            accessibilityLabel="Next day or range"
          >
            <Ionicons name="chevron-forward" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ marginTop: 6, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16 }}>
        <View style={{ flexDirection: "row", borderRadius: 8, padding: 2, backgroundColor: "rgba(255,255,255,0.1)" }}>
          {(["day", "3day", "week"] as const).map((key) => (
            <TouchableOpacity
              key={key}
              style={{
                borderRadius: 6,
                paddingHorizontal: 12,
                paddingVertical: 6,
                backgroundColor: ctx.viewMode === key ? Colors.white : "transparent",
              }}
              onPress={() => ctx.setViewMode(key)}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "600",
                  color: ctx.viewMode === key ? Colors.gray[900] : "rgba(255,255,255,0.7)",
                }}
              >
                {key === "day" ? "Day" : key === "3day" ? "3 day" : "Week"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={{ backgroundColor: CALENDAR_ACCENT, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}
          onPress={() => {
            const todayKey = formatDateKeyInTimeZone(new Date(), tz);
            const next = parseCalendarDateParam(todayKey, tz) ?? new Date();
            ctx.setSelectedDate(next);
          }}
          accessibilityLabel="Jump to today"
        >
          <Text style={{ fontSize: 12, fontWeight: "600", color: CALENDAR_DARK_HEADER }}>Today</Text>
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8, paddingHorizontal: 8 }} contentContainerStyle={{ flexDirection: "row" }}>
        {weekDays.map((day) => {
          const isSelected = isSameDay(day, ctx.selectedDate);
          const isToday = tz ? formatDateKeyInTimeZone(day, tz) === formatDateKeyInTimeZone(new Date(), tz) : isSameDay(day, new Date());
          return (
            <TouchableOpacity
              key={day.toISOString()}
              style={[
                { alignItems: "center", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginRight: 6, minWidth: 52, minHeight: 56 },
                isSelected ? { backgroundColor: CALENDAR_ACCENT } : isToday ? { borderWidth: 1.5, borderColor: "rgba(255,255,255,0.6)" } : {},
              ]}
              onPress={() => {
                ctx.setSelectedDate(day);
                if (ctx.viewMode === "week") ctx.setViewMode("day");
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: isSelected }}
            >
              <Text style={{ fontSize: 11, fontWeight: "600", color: isSelected ? CALENDAR_DARK_HEADER : "rgba(255,255,255,0.82)" }}>{format(day, "EEE")}</Text>
              <Text style={{ marginTop: 2, fontSize: 16, fontWeight: "700", color: isSelected ? CALENDAR_DARK_HEADER : Colors.white }}>{format(day, "d")}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

export function CalendarV2Chrome({
  ctx,
  segment,
  onSegmentChange,
}: {
  ctx: CalendarV2ChromeContext;
  segment: CalendarV2Segment;
  onSegmentChange: (s: CalendarV2Segment) => void;
}) {
  return (
    <View style={{ backgroundColor: CALENDAR_BG }}>
      <View style={{ paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4 }}>
        <SegmentTabs
          tabs={[
            { key: "schedule", label: "Schedule" },
            { key: "queue", label: "Queue", badgeCount: ctx.waitingRoomCount },
            { key: "insights", label: "Insights" },
          ]}
          activeKey={segment}
          onSelect={(k) => onSegmentChange(k as CalendarV2Segment)}
        />
      </View>
      {segment === "schedule" ? (
        <>
          <CalendarV2NavBar ctx={ctx} />
          <CalendarHeroSummary ctx={ctx} />
          <CalendarQuickActions ctx={ctx} />
        </>
      ) : null}
    </View>
  );
}
