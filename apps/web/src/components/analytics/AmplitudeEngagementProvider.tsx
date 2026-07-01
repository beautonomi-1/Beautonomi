"use client";

import { useEffect, useRef, ReactNode } from "react";
import * as amplitude from "@amplitude/analytics-browser";
import { useAmplitudeContext } from "@/providers/AmplitudeProvider";

let engagementPluginRegistered = false;

/**
 * Amplitude's Guides & Surveys runtime (loaded from their CDN by the engagement plugin)
 * uses the native Popover API (`showPopover` / `hidePopover` / `togglePopover`). Older browsers (and some
 * WebKit versions without full support) throw `hidePopover is not a function` during
 * decide / teardown — skip registering the plugin so analytics still works.
 */
function engagementPopoverHostSupported(): boolean {
  if (typeof HTMLElement === "undefined") return false;
  const proto = HTMLElement.prototype as HTMLElement & {
    showPopover?: () => void;
    hidePopover?: () => void;
    togglePopover?: () => boolean;
  };
  return (
    typeof proto.showPopover === "function" &&
    typeof proto.hidePopover === "function" &&
    typeof proto.togglePopover === "function"
  );
}

/**
 * Registers Amplitude Guides & Surveys via the official engagement plugin (bundled).
 * Avoids CDN script tags that can 401/403 or fail under ad blockers.
 * @see https://amplitude.com/docs/guides-and-surveys/sdk
 */
export default function AmplitudeEngagementProvider({ children }: { children: ReactNode }) {
  const { config, isInitialized } = useAmplitudeContext();
  const pluginAttached = useRef(false);

  useEffect(() => {
    // When the Amplitude SDK is torn down and re-initialized (e.g. anonymous →
    // signed-in flips Session Replay policy via hardResetAmplitudeBrowser), the
    // engagement plugin must be re-added to the fresh instance. Clear the guards
    // so the next initialized pass re-attaches it (amplitude.add is idempotent by
    // plugin name, so a redundant add on a surviving instance is a safe no-op).
    if (!isInitialized) {
      pluginAttached.current = false;
      engagementPluginRegistered = false;
      return;
    }

    if (!config?.api_key_public || (!config.surveys_enabled && !config.guides_enabled)) {
      return;
    }

    if (typeof window === "undefined") return;

    if (!engagementPopoverHostSupported()) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          "[Amplitude] Guides/Surveys engagement plugin skipped: native Popover API (showPopover/hidePopover/togglePopover) not available in this browser.",
        );
      }
      return;
    }

    let cancelled = false;

    import("@amplitude/engagement-browser")
      .then(({ plugin: engagementPlugin }) => {
        if (cancelled || pluginAttached.current || engagementPluginRegistered) return;
        try {
          amplitude.add(engagementPlugin());
          pluginAttached.current = true;
          engagementPluginRegistered = true;
        } catch {
          /* ignore — optional product surface */
        }
      })
      .catch(() => {
        /* ignore — optional product surface */
      });

    return () => {
      cancelled = true;
    };
  }, [config, isInitialized]);

  return <>{children}</>;
}
