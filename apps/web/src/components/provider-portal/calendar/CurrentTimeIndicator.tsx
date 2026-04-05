"use client";

import React, { forwardRef, memo } from "react";

interface CurrentTimeIndicatorProps {
  top: number;
}

export const CurrentTimeIndicator = memo(
  forwardRef<HTMLDivElement, CurrentTimeIndicatorProps>(function CurrentTimeIndicator({ top }, ref) {
    return (
      <div
        ref={ref}
        className="absolute left-0 right-0 z-[85] pointer-events-none"
        style={{ top: `${top}px` }}
      >
        <div className="flex items-center">
          <div className="w-2.5 h-2.5 bg-red-500 rounded-full ring-2 ring-white shadow-md shrink-0" />
          <div className="flex-1 min-w-0 h-[3px] bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.75)]" />
        </div>
      </div>
    );
  }),
);

CurrentTimeIndicator.displayName = "CurrentTimeIndicator";
