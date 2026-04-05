"use client";

import React, { memo, useCallback, useRef } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DroppableTimeSlot,
} from "@/components/provider-portal/DragDropCalendar";
import { HOUR_HEIGHT } from "./constants";
import {
  parseScheduledTime,
  isOutsideOperatingHours,
  isOutsideStaffHours,
} from "./utils";

interface GestureLayerProps {
  timeSlots: string[];
  date: Date;
  dateStr: string;
  staffId: string;
  useMangomintMode: boolean;
  highContrast: boolean;
  workStart: number;
  workEnd: number;
  locationOperatingHours?: Record<string, { open: string; close: string; closed: boolean }> | null;
  staffWorkingHours?: Record<string, { open: string; close: string; closed?: boolean }> | null;
  onTimeSlotClick: (date: Date, time: string, staffId: string) => void;
}

function GestureLayerComponent({
  timeSlots,
  date,
  dateStr,
  staffId,
  useMangomintMode,
  highContrast,
  workStart,
  workEnd,
  locationOperatingHours,
  staffWorkingHours,
  onTimeSlotClick,
}: GestureLayerProps) {
  const handleSlotClick = useCallback(
    (time: string) => onTimeSlotClick(date, time, staffId),
    [date, staffId, onTimeSlotClick],
  );

  return (
    <>
      {timeSlots.map((time) => {
        const { hour } = parseScheduledTime(time);
        const outsideLocation = isOutsideOperatingHours(date, hour, locationOperatingHours);
        const outsideStaff = staffWorkingHours
          ? isOutsideStaffHours(date, hour, staffWorkingHours)
          : false;
        const isNonWorking = outsideLocation || outsideStaff || hour < workStart || hour >= workEnd;
        const isHighContrast = useMangomintMode && highContrast;
        const blockedPattern =
          isHighContrast
            ? "repeating-linear-gradient(135deg, #1f2937 0px, #1f2937 6px, #374151 6px, #374151 12px)"
            : "repeating-linear-gradient(135deg, #e5e7eb 0px, #e5e7eb 6px, #d1d5db 6px, #d1d5db 12px)";

        return (
          <DroppableTimeSlot
            key={time}
            date={dateStr}
            time={time}
            staffId={staffId}
            className={cn(
              "border-b border-gray-200 transition-colors relative group/slot",
              isNonWorking
                ? "cursor-not-allowed border-l-[5px] border-l-amber-500/90 bg-amber-50/40"
                : "cursor-pointer hover:bg-gray-50/70",
            )}
          >
            <div
              className="relative"
              style={{
                height: `${HOUR_HEIGHT}px`,
                backgroundColor: isNonWorking && !isHighContrast ? "#f3f4f6" : undefined,
                backgroundImage: isNonWorking ? blockedPattern : undefined,
              }}
              onClick={isNonWorking ? undefined : () => handleSlotClick(time)}
            >
              {!isNonWorking && (
                <div className="absolute inset-0 opacity-0 group-hover/slot:opacity-100 transition-opacity pointer-events-none flex items-center justify-center">
                  <Plus className="w-5 h-5 text-gray-400" />
                </div>
              )}
              {isNonWorking && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-amber-900/70 bg-white/85 px-1.5 py-0.5 rounded border border-amber-200 shadow-sm">
                    Closed
                  </span>
                </div>
              )}
            </div>
          </DroppableTimeSlot>
        );
      })}
    </>
  );
}

export const GestureLayer = memo(GestureLayerComponent, (prev, next) =>
  prev.dateStr === next.dateStr &&
  prev.staffId === next.staffId &&
  prev.workStart === next.workStart &&
  prev.workEnd === next.workEnd &&
  prev.highContrast === next.highContrast &&
  prev.useMangomintMode === next.useMangomintMode &&
  prev.timeSlots.length === next.timeSlots.length &&
  prev.locationOperatingHours === next.locationOperatingHours &&
  prev.staffWorkingHours === next.staffWorkingHours &&
  prev.onTimeSlotClick === next.onTimeSlotClick,
);

GestureLayer.displayName = "GestureLayer";
