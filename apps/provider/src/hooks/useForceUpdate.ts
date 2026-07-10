import { useEffect, useState } from "react";
import { Alert, InteractionManager, Platform } from "react-native";
import { getBackendUrl, withWebApiTenantHeaders } from "@/config/public-env";
import {
  compareVersions,
  dismissSoftUpdate,
  getAppNativeVersion,
  isSoftUpdateDismissed,
} from "@/lib/app-native-version";
import { openAppStoreUpdate } from "@/lib/open-store-review";

interface VersionInfo {
  minVersion: string | null;
  latestVersion: string | null;
  updateUrl: string | null;
  forceUpdate: boolean;
}

export function useForceUpdate() {
  const [updateRequired, setUpdateRequired] = useState(false);
  const [requiredUpdateUrl, setRequiredUpdateUrl] = useState<string | null>(null);

  const openUpdate = () => {
    void openAppStoreUpdate(requiredUpdateUrl);
  };

  useEffect(() => {
    if (Platform.OS === "web") return;

    const currentVersion = getAppNativeVersion();

    const check = async () => {
      try {
        const v = encodeURIComponent(currentVersion);
        const base = getBackendUrl().replace(/\/$/, "");
        if (!base) return;
        const res = await fetch(
          `${base}/api/public/app-version?app=provider&platform=${Platform.OS}&version=${v}`,
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
            "A newer version of Beautonomi Partner is required to keep bookings, payments, and provider tools working correctly.",
            [
              {
                text: "Update Now",
                onPress: () => {
                  void openAppStoreUpdate(data.updateUrl);
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
          const dismissed = await isSoftUpdateDismissed(
            "provider",
            Platform.OS,
            data.latestVersion,
          );
          if (dismissed) return;

          Alert.alert(
            "Update Available",
            "A new version of Beautonomi is available with improvements and bug fixes.",
            [
              {
                text: "Later",
                style: "cancel",
                onPress: () => {
                  void dismissSoftUpdate("provider", Platform.OS, data.latestVersion!);
                },
              },
              {
                text: "Update",
                onPress: () => {
                  void openAppStoreUpdate(data.updateUrl);
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
