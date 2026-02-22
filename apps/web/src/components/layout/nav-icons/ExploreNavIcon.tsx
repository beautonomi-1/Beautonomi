"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface ExploreNavIconProps {
  className?: string;
  active?: boolean;
  size?: number;
}

/**
 * Skeuomorphic polaroid with sparkles icon.
 * Represents the explore feed / photo grid.
 */
export function ExploreNavIcon({ className, active, size = 28 }: ExploreNavIconProps) {
  const primary = active ? "#FF007F" : "#6b7280";
  const glow = active ? "rgba(255,0,127,0.4)" : "rgba(107,114,128,0.25)";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("flex-shrink-0", className)}
      aria-hidden
    >
      <defs>
        <linearGradient id="explore-polaroid-frame" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={primary} stopOpacity={0.15} />
          <stop offset="100%" stopColor={primary} stopOpacity={0.4} />
        </linearGradient>
        <filter id="explore-polaroid-shadow">
          <feDropShadow dx="0" dy="1.5" stdDeviation="0.8" floodColor={glow} floodOpacity="0.6" />
        </filter>
      </defs>
      <g filter="url(#explore-polaroid-shadow)">
        {/* Polaroid frame - white border with image area */}
        <rect
          x="6"
          y="4"
          width="20"
          height="24"
          rx="1"
          fill="white"
          stroke={primary}
          strokeWidth={1.2}
        />
        {/* Image area inside polaroid */}
        <rect
          x="8"
          y="6"
          width="16"
          height="14"
          fill="url(#explore-polaroid-frame)"
          stroke={primary}
          strokeWidth={0.8}
          strokeLinejoin="round"
        />
      </g>
      {/* Sparkles on the polaroid */}
      <circle cx="10" cy="9" r="0.8" fill={primary} opacity={0.9} />
      <circle cx="22" cy="9" r="0.8" fill={primary} opacity={0.9} />
      <circle cx="16" cy="13" r="1" fill={primary} opacity={0.95} />
      <circle cx="10" cy="17" r="0.6" fill={primary} opacity={0.7} />
      <circle cx="22" cy="17" r="0.6" fill={primary} opacity={0.7} />
    </svg>
  );
}
