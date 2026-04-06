"use client";

import React, { memo } from "react";
import { cn } from "@/lib/utils";
import { Coffee, Ban, Calendar } from "lucide-react";
import type { TimeBlock, AvailabilityBlockDisplay } from "@/lib/provider-portal/types";
import { HOUR_HEIGHT } from "./constants";
import {
  parseTimeRange,
  getBlockColors,
  getBlockLabel,
  isAvailabilityOverlay as checkIsAvailabilityOverlay,
  isStaffScheduleUnavailability,
  type CalendarBlock,
} from "./utils";

interface TimeBlockElementProps {
  block: CalendarBlock;
  startHour: number;
  useMangomintMode: boolean;
  onTimeBlockClick?: (block: TimeBlock) => void;
  /** "day" for full rendering, "week" for compact */
  variant: "day" | "week";
}

function TimeBlockElementComponent({
  block,
  startHour,
  useMangomintMode,
  onTimeBlockClick,
  variant,
}: TimeBlockElementProps) {
  const parsedRange = parseTimeRange(block.start_time, block.end_time);
  if (!parsedRange) return null;

  const { startHour: hour, startMinute: min, endHour: endH, endMinute: endM } = parsedRange;
  const durationMinutes = (endH * 60 + endM) - (hour * 60 + min);
  const top = (hour - startHour) * HOUR_HEIGHT + (min / 60) * HOUR_HEIGHT;
  const minH = variant === "day" ? 28 : 24;
  const height = Math.max((durationMinutes / 60) * HOUR_HEIGHT, minH);

  const isAvailability = checkIsAvailabilityOverlay(block);
  const colors = getBlockColors(block, useMangomintMode);
  const label = getBlockLabel(block);

  const blockTypeName = isAvailability
    ? ((block as AvailabilityBlockDisplay).block_type ?? "")
    : ((block as any).blocked_time_type_name ?? (block as any).blocked_time_type?.name ?? "");
  const lower = blockTypeName.toLowerCase();
  const isBreakOrLunch = lower.includes("break") || lower.includes("lunch");

  if (variant === "week") {
    return (
      <div
        className="absolute left-0.5 right-0.5 rounded px-1 py-0.5 z-[5]"
        style={{
          top: `${top}px`,
          height: `${height}px`,
          minHeight: `${minH}px`,
          backgroundColor: colors.bg,
          borderLeft: `3px solid ${colors.border}`,
        }}
      >
        <span
          className="text-[10px] font-medium truncate block"
          style={{ color: colors.text }}
        >
          {label}
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "absolute left-1 right-1 rounded-md px-2 py-1 transition-opacity z-[8]",
        !isAvailability && "cursor-pointer hover:opacity-90",
      )}
      style={{
        top: `${top}px`,
        height: `${height}px`,
        minHeight: `${minH}px`,
        backgroundColor: colors.bg,
        backgroundImage: useMangomintMode
          ? undefined
          : "repeating-linear-gradient(135deg, transparent, transparent 3px, rgba(0,0,0,0.03) 3px, rgba(0,0,0,0.03) 6px)",
        borderLeft: `3px solid ${colors.border}`,
      }}
      onClick={() => !isAvailability && onTimeBlockClick?.(block as TimeBlock)}
    >
      <div className="flex items-center gap-1">
        {isStaffScheduleUnavailability(block) ? (
          <Calendar className="w-3 h-3 shrink-0" style={{ color: colors.text }} />
        ) : isBreakOrLunch ? (
          <Coffee className="w-3 h-3 shrink-0" style={{ color: colors.text }} />
        ) : (
          <Ban className="w-3 h-3 shrink-0" style={{ color: colors.text }} />
        )}
        <span className="text-xs font-medium truncate" style={{ color: colors.text }}>
          {label}
        </span>
      </div>
      {height > 40 && (
        <p className="text-[10px] mt-0.5 opacity-70" style={{ color: colors.text }}>
          {block.start_time} - {block.end_time}
        </p>
      )}
    </div>
  );
}

export const TimeBlockElement = memo(TimeBlockElementComponent, (prev, next) =>
  prev.block.id === next.block.id &&
  prev.block.start_time === next.block.start_time &&
  prev.block.end_time === next.block.end_time &&
  prev.startHour === next.startHour &&
  prev.useMangomintMode === next.useMangomintMode &&
  prev.variant === next.variant,
);

TimeBlockElement.displayName = "TimeBlockElement";
