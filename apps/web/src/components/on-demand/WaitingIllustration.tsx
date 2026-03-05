"use client";

import React from "react";

/**
 * Web illustration for on-demand waiting screen: phone with subtle "finger tapping"
 * CSS animation. Matches customer app concept for consistency across platforms.
 */
export function WaitingIllustration() {
  return (
    <div className="flex flex-col items-center justify-center py-6">
      <div className="relative flex items-center justify-center">
        {/* Phone outline - subtle opacity pulse */}
        <div className="on-demand-phone-glow h-56 w-32 rounded-[2rem] border-4 border-gray-300 bg-white shadow-lg flex flex-col items-center justify-end pb-4">
          <div className="w-full flex-1 rounded-t-3xl bg-gray-100 min-h-[120px]" />
          <div className="w-20 h-1 rounded-full bg-gray-300" />
        </div>
        {/* Finger tap indicator - scale pulse */}
        <div className="on-demand-finger-tap absolute -bottom-2 right-2 h-10 w-8 rounded-full bg-primary/80 flex items-end justify-center pb-1">
          <div className="w-2 h-2 rounded-full bg-white/90" />
        </div>
      </div>
      <div className="flex flex-row gap-3 mt-6 opacity-60">
        <div className="h-2 w-2 rounded-full bg-primary/50" />
        <div className="h-3 w-3 rounded-full bg-primary/30" />
        <div className="h-2 w-2 rounded-full bg-primary/50" />
      </div>
    </div>
  );
}
