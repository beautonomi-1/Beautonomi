/**
 * KEEP IN SYNC: apps/customer/src/lib/tracking/request-att-before-tracking.ts
 *
 * Request iOS App Tracking Transparency before any SDK that may read IDFA (Singular).
 * No-op on Android/web. Only prompts when status is undetermined.
 */
import { InteractionManager, Platform } from "react-native";
import {
  getTrackingPermissionsAsync,
  PermissionStatus,
  requestTrackingPermissionsAsync,
} from "expo-tracking-transparency";
import { authFlowBreadcrumb, isSentryEnabled } from "@/lib/sentry";

export type AttRequestResult = PermissionStatus | "unavailable";

let inflight: Promise<AttRequestResult> | null = null;

function afterSplashSettled(): Promise<void> {
  return new Promise((resolve) => {
    InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

export async function requestAttBeforeTracking(): Promise<AttRequestResult> {
  if (Platform.OS !== "ios") return "unavailable";

  if (!inflight) {
    inflight = (async () => {
      try {
        await afterSplashSettled();
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
      }
    })();
  }
  return inflight;
}
