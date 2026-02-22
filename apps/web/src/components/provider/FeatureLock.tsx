"use client";

import React from "react";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

interface FeatureLockProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  showTooltip?: boolean;
  tooltipText?: string;
}

/**
 * FeatureLock - A simple lock icon component for gated features
 * Use this to visually indicate that a feature requires a subscription upgrade
 */
export function FeatureLock({
  className = "",
  size = "md",
  showTooltip = false,
  tooltipText = "Upgrade to unlock this feature",
}: FeatureLockProps) {
  const sizeClasses = {
    sm: "w-3 h-3",
    md: "w-4 h-4",
    lg: "w-5 h-5",
  };

  return (
    <div className={cn("relative inline-flex items-center", className)}>
      <Lock className={cn(sizeClasses[size], "text-yellow-600")} />
      {showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-gray-900 rounded whitespace-nowrap opacity-0 hover:opacity-100 transition-opacity pointer-events-none z-10">
          {tooltipText}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-gray-900" />
        </div>
      )}
    </div>
  );
}

/**
 * LockedFeatureBadge - Badge that shows a feature is locked
 */
interface LockedFeatureBadgeProps {
  text?: string;
  className?: string;
}

export function LockedFeatureBadge({
  text = "Premium",
  className = "",
}: LockedFeatureBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800 border border-yellow-200",
        className
      )}
    >
      <Lock className="w-3 h-3" />
      {text}
    </span>
  );
}
