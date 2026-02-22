"use client";

import React from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface SyncIndicatorProps {
  isSyncing?: boolean;
  lastSynced?: Date | null;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function SyncIndicator({ 
  isSyncing = false, 
  lastSynced = null,
  className,
  size = "sm"
}: SyncIndicatorProps) {
  const sizeClasses = {
    sm: "w-3 h-3",
    md: "w-4 h-4",
    lg: "w-5 h-5"
  };

  const textSizeClasses = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-base"
  };

  if (!isSyncing && !lastSynced) {
    return null;
  }

  return (
    <div className={cn("flex items-center gap-2 text-gray-500", className)}>
      {isSyncing ? (
        <>
          <RefreshCw className={cn(sizeClasses[size], "animate-spin text-blue-500")} />
          <span className={cn(textSizeClasses[size], "text-blue-500")}>Syncing...</span>
        </>
      ) : lastSynced ? (
        <>
          <div className={cn(sizeClasses[size], "rounded-full bg-green-500")} />
          <span className={cn(textSizeClasses[size])}>
            Synced {formatLastSynced(lastSynced)}
          </span>
        </>
      ) : null}
    </div>
  );
}

function formatLastSynced(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}
