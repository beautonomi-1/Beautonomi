"use client";

import React from "react";
import { useModuleConfig } from "@/providers/ConfigBundleProvider";

/**
 * Simple waiting screen that reads on_demand module config.
 * Use behind feature flag; no full matching logic yet.
 */
export function WaitingScreen() {
  const config = useModuleConfig("on_demand");
  const timeoutSec = config.waiting_screen_timeout_seconds ?? 45;
  const uiCopy = config.ui_copy as Record<string, string> | undefined;
  const title = uiCopy?.title ?? "Please wait";
  const message = uiCopy?.message ?? "We're connecting you...";

  return (
    <div className="flex flex-col items-center justify-center min-h-[200px] gap-4 p-6">
      <div className="animate-pulse rounded-full h-12 w-12 bg-muted" />
      <h3 className="font-medium">{title}</h3>
      <p className="text-sm text-muted-foreground">{message}</p>
      <p className="text-xs text-muted-foreground">Timeout: {timeoutSec}s</p>
    </div>
  );
}
