import { Platform } from "react-native";
import Constants from "expo-constants";

/**
 * Device / app context for Amplitude identify and segmentation (non-PII).
 * Sent with POST /api/me/analytics/identify from native apps.
 */
export function getMobileAnalyticsAttribution(): Record<string, string> {
  const os = Platform.OS;
  let device_model: string | undefined;
  if (os === "android") {
    const c = Platform.constants as { Model?: string; manufacturer?: string } | undefined;
    if (c?.Model) device_model = String(c.Model);
    else if (c?.manufacturer) device_model = String(c.manufacturer);
  }
  if (os === "ios") {
    device_model = (Constants as { deviceName?: string }).deviceName;
  }

  const app_version =
    Constants.expoConfig?.version ?? Constants.nativeApplicationVersion ?? "unknown";
  const app_build = Constants.nativeBuildVersion != null ? String(Constants.nativeBuildVersion) : "";

  const os_version =
    typeof Platform.Version === "string" ? Platform.Version : String(Platform.Version ?? "");

  return {
    platform: os,
    device_type: os === "ios" ? "ios" : os === "android" ? "android" : os,
    app_version,
    ...(app_build ? { app_build } : {}),
    os_version,
    ...(device_model ? { device_model } : {}),
  };
}
