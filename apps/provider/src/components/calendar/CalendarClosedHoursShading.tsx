import type { ReactNode } from "react";
import { View, type ViewStyle } from "react-native";
import { mergeRanges, type MinuteRange } from "@beautonomi/utils";
import { CALENDAR_GRID_TOP_PADDING } from "@/components/calendar/calendar-layout";

type ShadingViewStyle = ViewStyle;

/**
 * Renders closed / non-operating vertical bands on the day column (between merged open ranges).
 */
export function CalendarClosedHoursShading({
  openRanges,
  gridStartMin,
  gridEndMin,
  slotHeight,
  gridTopPadding = CALENDAR_GRID_TOP_PADDING,
  shadeBg,
  opacity = 0.3,
}: {
  openRanges: MinuteRange[] | null;
  gridStartMin: number;
  gridEndMin: number;
  slotHeight: number;
  gridTopPadding?: number;
  shadeBg: string;
  opacity?: number;
}) {
  if (openRanges == null) return null;

  const minToTop = (min: number) =>
    gridTopPadding + ((Math.max(gridStartMin, Math.min(gridEndMin, min)) - gridStartMin) / 60) * slotHeight;

  const elements: ReactNode[] = [];
  let cursor = gridStartMin;
  mergeRanges(openRanges).forEach((range, idx) => {
    if (range.endMin <= gridStartMin || range.startMin >= gridEndMin) return;
    if (range.startMin > cursor) {
      const top = minToTop(cursor);
      const bottom = minToTop(range.startMin);
      const height = bottom - top;
      if (height > 0) {
        const style: ShadingViewStyle = {
          position: "absolute",
          left: 0,
          right: 0,
          top,
          height,
          backgroundColor: shadeBg,
          opacity,
          zIndex: 1,
          pointerEvents: "none",
        };
        elements.push(<View key={`gap-${idx}-before`} style={style} />);
      }
    }
    cursor = Math.max(cursor, range.endMin);
  });
  if (cursor < gridEndMin) {
    const top = minToTop(cursor);
    const bottom = minToTop(gridEndMin);
    const height = bottom - top;
    if (height > 0) {
      const style: ShadingViewStyle = {
        position: "absolute",
        left: 0,
        right: 0,
        top,
        height,
        backgroundColor: shadeBg,
        opacity,
        zIndex: 1,
        pointerEvents: "none",
      };
      elements.push(<View key="tail" style={style} />);
    }
  }
  return <>{elements}</>;
}
