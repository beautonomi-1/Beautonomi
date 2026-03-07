import { useEffect, useState } from "react";
import { Alert, Linking, Platform } from "react-native";
import Constants from "expo-constants";
import { APP_URL } from "@/config/public-env";

interface VersionInfo {
  minVersion: string;
  latestVersion: string;
  updateUrl: string;
  forceUpdate: boolean;
}

function compareVersions(a: string, b: string): number {
  const aParts = a.split(".").map(Number);
  const bParts = b.split(".").map(Number);
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

  useEffect(() => {
    if (Platform.OS === "web") return;

    const currentVersion = Constants.expoConfig?.version ?? "1.0.0";

    const check = async () => {
      try {
        const res = await fetch(
          `${APP_URL}/api/public/app-version?app=customer&platform=${Platform.OS}`,
        );
        if (!res.ok) return;

        const data: VersionInfo = await res.json();

        if (data.forceUpdate && compareVersions(currentVersion, data.minVersion) < 0) {
          setUpdateRequired(true);
          Alert.alert(
            "Update Required",
            "A new version of Beautonomi is available. Please update to continue using the app.",
            [
              {
                text: "Update Now",
                onPress: () => {
                  if (data.updateUrl) {
                    Linking.openURL(data.updateUrl);
                  } else {
                    const storeUrl =
                      Platform.OS === "ios"
                        ? "https://apps.apple.com/app/beautonomi/id0000000000"
                        : "https://play.google.com/store/apps/details?id=com.beautonomi";
                    Linking.openURL(storeUrl);
                  }
                },
              },
            ],
            { cancelable: false },
          );
        } else if (compareVersions(currentVersion, data.latestVersion) < 0) {
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
                      ? "https://apps.apple.com/app/beautonomi/id0000000000"
                      : "https://play.google.com/store/apps/details?id=com.beautonomi");
                  Linking.openURL(storeUrl);
                },
              },
            ],
          );
        }
      } catch {
        // Silent fail - version check is best-effort
      }
    };

    check();
  }, []);

  return { updateRequired };
}
