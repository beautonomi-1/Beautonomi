"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface HomeNavIconProps {
  className?: string;
  active?: boolean;
  size?: number;
}

/**
 * Skeuomorphic minimalist salon chair icon.
 * Represents the literal "seat" of the service.
 */
export function HomeNavIcon({ className, active, size = 28 }: HomeNavIconProps) {
  const primary = active ? "#FF007F" : "#6b7280";
  const shadow = active ? "rgba(255,0,127,0.3)" : "rgba(0,0,0,0.18)";

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
        <linearGradient id="home-chair-seat" x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stopColor={primary} stopOpacity={0.5} />
          <stop offset="100%" stopColor={primary} stopOpacity={0.95} />
        </linearGradient>
        <linearGradient id="home-chair-back" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={primary} stopOpacity={0.2} />
          <stop offset="100%" stopColor={primary} stopOpacity={0.6} />
        </linearGradient>
        <filter id="home-chair-shadow">
          <feDropShadow dx="0" dy="2" stdDeviation="1" floodColor={shadow} floodOpacity="0.5" />
        </filter>
      </defs>
      {/* Base shadow */}
      <g filter="url(#home-chair-shadow)">
        <ellipse cx="16" cy="26" rx="7" ry="2" fill={primary} opacity={0.25} />
      </g>
      {/* Hydraulic base / stem */}
      <rect x="14" y="20" width="4" height="5" rx="1" fill={primary} opacity={0.4} stroke={primary} strokeWidth={0.8} />
      {/* Seat cushion */}
      <rect x="7" y="13" width="18" height="7" rx="2" fill="url(#home-chair-seat)" stroke={primary} strokeWidth={1} />
      {/* Chair back / headrest */}
      <rect x="9" y="5" width="14" height="9" rx="1.5" fill="url(#home-chair-back)" stroke={primary} strokeWidth={1} />
    </svg>
  );
}
