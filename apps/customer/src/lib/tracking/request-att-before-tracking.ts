/**
 * KEEP IN SYNC: apps/provider/src/lib/tracking/request-att-before-tracking.ts
 *
 * Request iOS App Tracking Transparency before any SDK that may read IDFA (Singular).
 * No-op on Android/web. Only prompts when status is undetermined.
 */
import { AppState, InteractionManager, Platform } from "react-native";
import {
  getTrackingPermissionsAsync,
  PermissionStatus,
  requestTrackingPermissionsAsync,
} from "expo-tracking-transparency";
import { authFlowBreadcrumb, isSentryEnabled } from "@/lib/sentry";

export type AttRequestResult = PermissionStatus | "unavailable";

let inflight: Promise<AttRequestResult> | null = null;

let attBootstrapResolve: (() => void) | null = null;

/** Resolves when ATT flow completes (or is skipped on non-iOS). Gate analytics on this. */
export const attBootstrapPromise: Promise<void> = new Promise((resolve) => {
  attBootstrapResolve = resolve;
});

export function markAttBootstrapComplete(): void {
  attBootstrapResolve?.();
  attBootstrapResolve = null;
}

function waitForAppStateActive(): Promise<void> {
  if (AppState.currentState === "active") return Promise.resolve();
  return new Promise((resolve) => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        sub.remove();
        resolve();
      }
    });
  });
}

function afterInteractionsAndFrames(): Promise<void> {
  return new Promise((resolve) => {
    InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });
  });
}

const ATT_SURFACE_DELAY_MS = __DEV__ ? 300 : 500;

/** Wait until splash is hidden and a visible UI surface exists (iPad-safe). */
export async function waitForAttPromptSurface(): Promise<void> {
  if (Platform.OS !== "ios") return;
  await waitForAppStateActive();
  await afterInteractionsAndFrames();
  await new Promise((r) => setTimeout(r, ATT_SURFACE_DELAY_MS));
}

export async function requestAttBeforeTracking(): Promise<AttRequestResult> {
  if (Platform.OS !== "ios") {
    markAttBootstrapComplete();
    return "unavailable";
  }

  if (!inflight) {
    inflight = (async () => {
      try {
        await waitForAttPromptSurface();
        const current = await getTrackingPermissionsAsync();
        if (current.status === PermissionStatus.UNDETERMINED) {
          const { status } = await requestTrackingPermissionsAsync();
          if (isSentryEnabled()) {
            authFlowBreadcrumb("att_request_completed", { status });
          }
          return status;
        }
        if (isSentryEnabled()) {
          authFlowBreadcrumb("att_request_skipped", { status: current.status });
        }
        return current.status;
      } catch (e) {
        if (isSentryEnabled()) {
          authFlowBreadcrumb("att_request_failed", {
            message: e instanceof Error ? e.message : String(e),
          });
        }
        return "unavailable";
      } finally {
        inflight = null;
        markAttBootstrapComplete();
      }
    })();
  }
  return inflight;
}
