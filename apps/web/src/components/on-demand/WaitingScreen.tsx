"use client";

import React from "react";
import { useModuleConfig } from "@/providers/ConfigBundleProvider";
import { WaitingIllustration } from "./WaitingIllustration";

/**
 * Simple waiting screen that reads on_demand module config.
 * Uses same ui_copy keys as full flow: waiting_title, waiting_headline, waiting_subtitle.
 * For full experience with request ID, provider name, countdown and cancel use the
 * /book/on-demand/waiting page with requestId in query.
 */
export function WaitingScreen() {
  const config = useModuleConfig("on_demand");
  const timeoutSec = config.waiting_screen_timeout_seconds ?? 45;
  const uiCopy = (config?.ui_copy ?? {}) as Record<string, string>;
  const title = uiCopy.waiting_title ?? uiCopy.title ?? "Request sent";
  const headline = uiCopy.waiting_headline ?? uiCopy.message ?? "Connecting you with beauty.";
  const message = uiCopy.waiting_subtitle ?? uiCopy.message ?? "We're connecting you...";

  return (
    <div className="flex flex-col items-center justify-center min-h-[280px] gap-4 p-6 bg-slate-50 rounded-xl">
      <WaitingIllustration />
      <h3 className="font-semibold text-center">{title}</h3>
      <p className="text-sm text-muted-foreground text-center">{headline}</p>
      <p className="text-sm text-muted-foreground text-center">{message}</p>
      <p className="text-xs text-muted-foreground">Timeout: {timeoutSec}s</p>
    </div>
  );
}
