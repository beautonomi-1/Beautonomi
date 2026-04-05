"use client";

import React, { memo } from "react";
import { HOUR_HEIGHT, TIME_COLUMN_WIDTH } from "./constants";
import { formatTime12h } from "./utils";

interface TimeColumnProps {
  timeSlots: string[];
}

function TimeColumnComponent({ timeSlots }: TimeColumnProps) {
  return (
    <div
      className="flex-shrink-0 border-r-2 border-gray-200 bg-gray-50/80 sticky left-0 z-10"
      style={{ width: `${TIME_COLUMN_WIDTH}px` }}
    >
      {timeSlots.map((time) => (
        <div
          key={time}
          className="border-b border-gray-200 flex items-start justify-end pr-2 pt-0"
          style={{ height: `${HOUR_HEIGHT}px` }}
        >
          <span className="text-xs font-medium text-gray-400 -translate-y-2">
            {formatTime12h(time)}
          </span>
        </div>
      ))}
    </div>
  );
}

export const TimeColumn = memo(TimeColumnComponent);
TimeColumn.displayName = "TimeColumn";
