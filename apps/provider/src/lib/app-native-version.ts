import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

const FALLBACK_VERSION = "1.0.0";

/** Store binary version (Info.plist / Play versionName), then Expo config. */
export function getAppNativeVersion(): string {
  return (
    Constants.nativeApplicationVersion ??
    Constants.expoConfig?.version ??
    FALLBACK_VERSION
  );
}

export function compareVersions(a: string, b: string): number {
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

function softUpdateDismissKey(
  app: "customer" | "provider",
  platform: string,
  latestVersion: string,
): string {
  return `soft_update_dismissed:${app}:${platform}:${latestVersion}`;
}

export async function isSoftUpdateDismissed(
  app: "customer" | "provider",
  platform: string,
  latestVersion: string,
): Promise<boolean> {
  const value = await AsyncStorage.getItem(
    softUpdateDismissKey(app, platform, latestVersion),
  );
  return value === "1";
}

export async function dismissSoftUpdate(
  app: "customer" | "provider",
  platform: string,
  latestVersion: string,
): Promise<void> {
  await AsyncStorage.setItem(
    softUpdateDismissKey(app, platform, latestVersion),
    "1",
  );
}
