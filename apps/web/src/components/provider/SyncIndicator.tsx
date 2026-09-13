"use client";

import { useTranslation } from "@beautonomi/i18n";

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
  const { t } = useTranslation();
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
          <span className={cn(textSizeClasses[size], "text-blue-500")}>{t("web.providerExtras.syncing")}</span>
        </>
      ) : lastSynced ? (
        <>
          <div className={cn(sizeClasses[size], "rounded-full bg-green-500")} />
          <span className={cn(textSizeClasses[size])}>
            {formatLastSynced(lastSynced)}
          </span>
        </>
      ) : null}
    </div>
  );

  function formatLastSynced(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (seconds < 10) return t("web.providerExtras.syncedJustNow");
    if (seconds < 60) return t("web.providerExtras.syncedSecondsAgo", { count: seconds });
    if (minutes < 60) return t("web.providerExtras.syncedMinutesAgo", { count: minutes });
    if (hours < 24) return t("web.providerExtras.syncedHoursAgo", { count: hours });
    return t("web.providerExtras.syncedAt", {
      time: date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
    });
  }
}
