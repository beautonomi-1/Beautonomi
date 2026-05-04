import type { ReactNode } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { format } from "date-fns";
import { Colors } from "@/constants/colors";
import type { CalendarBooking } from "@/components/calendar/calendar-booking-types";
import { CALENDAR_GRID_TOP_PADDING } from "@/components/calendar/calendar-layout";
import { CalendarClosedHoursShading } from "@/components/calendar/CalendarClosedHoursShading";
import {
  CalendarOverlayTimeBlock,
  type CalendarOverlayTimeBlockModel,
} from "@/components/calendar/CalendarOverlayTimeBlock";
import { CurrentTimeIndicator } from "@/components/calendar/CurrentTimeIndicator";
import type { MinuteRange } from "@beautonomi/utils";

export function CalendarDayGridColumn({
  day,
  colWidth,
  totalGridHeight,
  gridTopPadding = CALENDAR_GRID_TOP_PADDING,
  rowHeight,
  slotHeight,
  startHour,
  endHour,
  quarterHeight,
  gridRows,
  closedRanges,
  closedHoursShadeBg,
  overlayBlocks,
  bookingsForDay,
  renderBookingBlock,
  onSlotPress,
  onOverlayBlockPress,
  getOverlayAccessibilityLabel,
  slotAccessibilityLabel,
  showEmptyDayHint,
  emptyDayHint,
  showTimeIndicator,
  viewMode,
  isTodayInBusinessZone,
  providerTimezone,
  currentTimeA11yPrefix,
}: {
  day: Date;
  colWidth: number;
  totalGridHeight: number;
  gridTopPadding?: number;
  rowHeight: number;
  slotHeight: number;
  startHour: number;
  endHour: number;
  quarterHeight: number;
  gridRows: { hour: number; minute: number; label: string }[];
  closedRanges: MinuteRange[] | null;
  closedHoursShadeBg: string;
  overlayBlocks: CalendarOverlayTimeBlockModel[];
  bookingsForDay: CalendarBooking[];
  renderBookingBlock: (b: CalendarBooking) => ReactNode;
  onSlotPress: (hour: number, minute: number) => void;
  onOverlayBlockPress: (block: CalendarOverlayTimeBlockModel) => void;
  getOverlayAccessibilityLabel?: (block: CalendarOverlayTimeBlockModel) => string;
  slotAccessibilityLabel?: (row: { hour: number; minute: number; label: string }, day: Date) => string;
  showEmptyDayHint: boolean;
  emptyDayHint: string;
  showTimeIndicator: boolean;
  viewMode: "day" | "3day" | "week";
  isTodayInBusinessZone: boolean;
  providerTimezone: string | null;
  currentTimeA11yPrefix?: string;
}) {
  const gridStartMin = startHour * 60;
  const gridEndMin = (endHour + 1) * 60;

  const defaultSlotA11y = (row: { hour: number; minute: number; label: string }, d: Date) =>
    `Book at ${row.label} on ${format(d, "EEEE, MMMM d")}`;
  const slotA11y = slotAccessibilityLabel ?? defaultSlotA11y;

  return (
    <View
      style={{
        width: colWidth,
        height: totalGridHeight + gridTopPadding,
        position: "relative",
      }}
    >
      <CalendarClosedHoursShading
        openRanges={closedRanges}
        gridStartMin={gridStartMin}
        gridEndMin={gridEndMin}
        slotHeight={slotHeight}
        gridTopPadding={gridTopPadding}
        shadeBg={closedHoursShadeBg}
        opacity={0.3}
      />

      <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, zIndex: 1 }}>
        {gridRows.map((row, idx) => (
          <TouchableOpacity
            key={`${row.hour}-${row.minute}`}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: idx * rowHeight + gridTopPadding,
              height: rowHeight,
              borderTopWidth: 1,
              borderTopColor: row.minute === 0 ? Colors.gray[200] : Colors.gray[50],
            }}
            activeOpacity={0.6}
            onPress={() => onSlotPress(row.hour, row.minute)}
            accessibilityRole="button"
            accessibilityLabel={slotA11y(row, day)}
          />
        ))}
        {Array.from({ length: endHour - startHour }, (_, i) => (
          <View
            key={`half-${i}`}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: i * slotHeight + slotHeight / 2 + gridTopPadding,
              height: 1,
              borderTopWidth: 1,
              borderStyle: "dashed",
              borderColor: "#e5e7eb",
              zIndex: 0,
              pointerEvents: "none",
            }}
          />
        ))}
      </View>

      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          zIndex: 5,
          pointerEvents: "box-none",
        }}
      >
        {overlayBlocks.map((tb) => (
          <CalendarOverlayTimeBlock
            key={tb.id}
            block={tb}
            startHour={startHour}
            endHour={endHour}
            slotHeight={slotHeight}
            gridTopPadding={gridTopPadding}
            quarterHeight={quarterHeight}
            onInteractivePress={
              tb.calendar_overlay_kind ? () => onOverlayBlockPress(tb) : undefined
            }
            accessibilityLabel={getOverlayAccessibilityLabel?.(tb)}
          />
        ))}
      </View>

      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          zIndex: 10,
          pointerEvents: "box-none",
        }}
      >
        {bookingsForDay.map((b) => renderBookingBlock(b))}
      </View>

      {showEmptyDayHint && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: gridTopPadding + 40,
            alignItems: "center",
            zIndex: 4,
          }}
        >
          <View
            style={{
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: Colors.gray[50],
              borderWidth: 1,
              borderColor: Colors.gray[200],
            }}
          >
            <Text style={{ fontSize: 12, color: Colors.gray[500] }}>{emptyDayHint}</Text>
          </View>
        </View>
      )}

      {showTimeIndicator && viewMode === "day" && isTodayInBusinessZone && (
        <CurrentTimeIndicator
          startHour={startHour}
          slotHeight={slotHeight}
          endHour={endHour}
          totalGridHeight={totalGridHeight}
          timeZone={providerTimezone}
          accessibilityLabelPrefix={currentTimeA11yPrefix}
        />
      )}
    </View>
  );
}
