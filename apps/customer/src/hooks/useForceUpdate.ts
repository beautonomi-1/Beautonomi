import { useEffect, useState } from "react";
import { Alert, InteractionManager, Linking, Platform } from "react-native";
import Constants from "expo-constants";
import {
  ANDROID_PLAY_STORE_PACKAGE,
  APP_URL,
  IOS_APP_STORE_ID,
  withWebApiTenantHeaders,
} from "@/config/public-env";

interface VersionInfo {
  minVersion: string | null;
  latestVersion: string | null;
  updateUrl: string | null;
  forceUpdate: boolean;
}

function compareVersions(a: string, b: string): number {
  const parse = (value: string) =>
    value
      .trim()
      .replace(/^v/i, "")
      .split(/[+-]/)[0]
      .split(".")
      .map((part) => Number.parseInt(part, 10))
      .map((part) => (Number.isFinite(part) ? part : 0));
  const aParts = parse(a);
  const bParts = parse(b);
  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    const aVal = aParts[i] ?? 0;
    const bVal = bParts[i] ?? 0;
    if (aVal < bVal) return -1;
    if (aVal > bVal) return 1;
  }
  return 0;
}

export function useForceUpdate() {
  const [updateRequired, setUpdateRequired] = useState(false);
  const [requiredUpdateUrl, setRequiredUpdateUrl] = useState<string | null>(null);

  const openUpdate = () => {
    const storeUrl =
      requiredUpdateUrl ??
      (Platform.OS === "ios"
        ? `https://apps.apple.com/app/id${IOS_APP_STORE_ID}`
        : `https://play.google.com/store/apps/details?id=${encodeURIComponent(ANDROID_PLAY_STORE_PACKAGE)}`);
    void Linking.openURL(storeUrl);
  };

  useEffect(() => {
    if (Platform.OS === "web") return;

    const currentVersion = Constants.expoConfig?.version ?? "1.0.0";

    const check = async () => {
      try {
        const v = encodeURIComponent(currentVersion);
        const res = await fetch(
          `${APP_URL}/api/public/app-version?app=customer&platform=${Platform.OS}&version=${v}`,
          withWebApiTenantHeaders(),
        );
        if (!res.ok) return;

        const data: VersionInfo = await res.json();

        if (
          data.forceUpdate &&
          typeof data.minVersion === "string" &&
          data.minVersion.length > 0 &&
          compareVersions(currentVersion, data.minVersion) < 0
        ) {
          setUpdateRequired(true);
          setRequiredUpdateUrl(data.updateUrl ?? null);
          Alert.alert(
            "Update Required",
            "A newer version of Beautonomi is required to keep bookings, checkout, and account features working correctly.",
            [
              {
                text: "Update Now",
                onPress: () => {
                  const storeUrl =
                    data.updateUrl ??
                    (Platform.OS === "ios"
                      ? `https://apps.apple.com/app/id${IOS_APP_STORE_ID}`
                      : `https://play.google.com/store/apps/details?id=${encodeURIComponent(ANDROID_PLAY_STORE_PACKAGE)}`);
                  void Linking.openURL(storeUrl);
                },
              },
            ],
            { cancelable: false },
          );
        } else if (
          typeof data.latestVersion === "string" &&
          data.latestVersion.length > 0 &&
          compareVersions(currentVersion, data.latestVersion) < 0
        ) {
          Alert.alert(
            "Update Available",
            "A new version of Beautonomi is available with improvements and bug fixes.",
            [
              { text: "Later", style: "cancel" },
              {
                text: "Update",
                onPress: () => {
                  const storeUrl =
                    data.updateUrl ??
                    (Platform.OS === "ios"
                      ? `https://apps.apple.com/app/id${IOS_APP_STORE_ID}`
                      : `https://play.google.com/store/apps/details?id=${encodeURIComponent(ANDROID_PLAY_STORE_PACKAGE)}`);
                  void Linking.openURL(storeUrl);
                },
              },
            ],
          );
        }
      } catch {
        // Silent fail - version check is best-effort
      }
    };

    const task = InteractionManager.runAfterInteractions(() => {
      void check();
    });
    return () => {
      task.cancel?.();
    };
  }, []);

  return { updateRequired, openUpdate };
}
