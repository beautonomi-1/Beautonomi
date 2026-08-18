import { Platform } from "react-native";
import { isScreenshotMode } from "@/config/public-env";

/**
 * Show the system App Tracking Transparency prompt on iOS when status is undetermined.
 * Must run before Singular (or any SDK that reads IDFA).
 */
export async function requestAttBeforeTracking(): Promise<void> {
  if (Platform.OS !== "ios" || isScreenshotMode()) return;

  try {
    const {
      getTrackingPermissionsAsync,
      requestTrackingPermissionsAsync,
    } = await import("expo-tracking-transparency");

    const current = await getTrackingPermissionsAsync();
    if (current.status === "undetermined") {
      await requestTrackingPermissionsAsync();
    }
  } catch {
    // Expo Go / missing native module — init trackers without IDFA
  }
}
