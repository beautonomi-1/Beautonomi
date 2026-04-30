import { Text, View, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  getCalendarOverlayColors,
  formatOverlayTitle,
  type CalendarOverlayColorSource,
} from "@/components/calendar/calendar-overlay-colors";
import { parseCalendarTimeStrict } from "@/lib/provider-calendar-parity";

export interface CalendarOverlayTimeBlockModel extends CalendarOverlayColorSource {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  calendar_overlay_kind?: "availability" | "staff_off" | "time_block" | "booking_hold";
}

export function CalendarOverlayTimeBlock({
  block,
  startHour,
  slotHeight,
  gridTopPadding,
  quarterHeight,
  onInteractivePress,
  accessibilityLabel,
}: {
  block: CalendarOverlayTimeBlockModel;
  startHour: number;
  slotHeight: number;
  gridTopPadding: number;
  quarterHeight: number;
  onInteractivePress?: () => void;
  /** Screen reader label when interactive (should include edit/delete hint). */
  accessibilityLabel?: string;
}) {
  const bColors = getCalendarOverlayColors(block);
  const startMin = parseCalendarTimeStrict(block.start_time);
  const endMin = parseCalendarTimeStrict(block.end_time);
  if (startMin == null || endMin == null || endMin <= startMin) return null;
  const top = gridTopPadding + Math.max(0, (startMin / 60 - startHour) * slotHeight);
  const height = Math.max(((endMin - startMin) / 60) * slotHeight, quarterHeight);
  const interactive = !!block.calendar_overlay_kind;
  const isBookingHold = block.calendar_overlay_kind === "booking_hold";
  const boxStyle = isBookingHold
    ? {
        position: "absolute" as const,
        left: 4,
        right: 4,
        top,
        height,
        zIndex: 5,
        overflow: "hidden" as const,
        borderRadius: 6,
        borderWidth: 1,
        borderStyle: "dashed" as const,
        borderColor: bColors.border,
        backgroundColor: bColors.bg,
        paddingHorizontal: 6,
        paddingVertical: 2,
      }
    : {
        position: "absolute" as const,
        left: 4,
        right: 4,
        top,
        height,
        zIndex: 5,
        overflow: "hidden" as const,
        borderRadius: 6,
        borderLeftWidth: 3,
        borderLeftColor: bColors.border,
        backgroundColor: bColors.bg,
        paddingHorizontal: 6,
        paddingVertical: 2,
      };
  const label = (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <Ionicons name={bColors.icon as keyof typeof Ionicons.glyphMap} size={10} color={bColors.text} />
      <Text style={{ marginLeft: 4, fontSize: 9, fontWeight: "500", color: bColors.text }} numberOfLines={1}>
        {formatOverlayTitle(block)}
      </Text>
    </View>
  );
  const a11y =
    accessibilityLabel ??
    `${block.block_type} ${block.start_time} to ${block.end_time}. Tap for edit or delete.`;
  if (interactive && onInteractivePress) {
    return (
      <Pressable
        key={block.id}
        onPress={onInteractivePress}
        style={({ pressed }) => [boxStyle, { opacity: pressed ? 0.88 : 1 }]}
        accessibilityRole="button"
        accessibilityLabel={a11y}
      >
        {label}
      </Pressable>
    );
  }
  return (
    <View key={block.id} style={[boxStyle, { pointerEvents: "none" }]}>
      {label}
    </View>
  );
}
