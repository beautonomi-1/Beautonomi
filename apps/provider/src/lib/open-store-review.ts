import { Linking, Platform } from "react-native";
import { ANDROID_PLAY_STORE_PACKAGE, APP_URL, IOS_APP_STORE_ID } from "@/config/public-env";

/**
 * Opens the native store review flow (iOS App Store write-review, Android Play listing).
 * On web, opens the marketing download page when `EXPO_PUBLIC_APP_URL` is set.
 */
export async function openNativeStoreReview(): Promise<void> {
  if (Platform.OS === "ios") {
    const id = IOS_APP_STORE_ID?.trim();
    if (id && id !== "0000000000") {
      const write = `https://apps.apple.com/app/id${id}?action=write-review`;
      const base = `https://apps.apple.com/app/id${id}`;
      await Linking.openURL(write).catch(() => Linking.openURL(base).catch(() => {}));
      return;
    }
  }
  if (Platform.OS === "android" && ANDROID_PLAY_STORE_PACKAGE) {
    const pkg = ANDROID_PLAY_STORE_PACKAGE;
    const market = `market://details?id=${encodeURIComponent(pkg)}`;
    const https = `https://play.google.com/store/apps/details?id=${encodeURIComponent(pkg)}`;
    await Linking.openURL(market).catch(() => Linking.openURL(https).catch(() => {}));
    return;
  }
  const base = APP_URL?.trim().replace(/\/$/, "");
  if (base) {
    await Linking.openURL(`${base}/download`).catch(() => {});
  }
}
