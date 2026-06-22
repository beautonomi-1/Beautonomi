import { Linking, Platform } from "react-native";
import { ANDROID_PLAY_STORE_PACKAGE, APP_URL, IOS_APP_STORE_ID } from "@/config/public-env";

function playStorePackageFromUrl(url: string): string | null {
  try {
    const id = new URL(url).searchParams.get("id");
    if (id) return id;
  } catch {
    // ignore invalid URLs
  }
  const match = url.match(/[?&]id=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function openAndroidPlayListing(httpsUrl: string, fallbackPackage: string): Promise<void> {
  const pkg = playStorePackageFromUrl(httpsUrl) || fallbackPackage;
  const market = `market://details?id=${encodeURIComponent(pkg)}`;
  const envHttps = `https://play.google.com/store/apps/details?id=${encodeURIComponent(fallbackPackage)}`;
  await Linking.openURL(market)
    .catch(() => Linking.openURL(httpsUrl).catch(() => Linking.openURL(envHttps).catch(() => {})));
}

/**
 * Opens the app's store listing for forced or optional updates.
 * Android prefers the native Play Store app (`market://`) with HTTPS fallbacks.
 */
export async function openAppStoreUpdate(updateUrl?: string | null): Promise<void> {
  if (Platform.OS === "ios") {
    const id = IOS_APP_STORE_ID?.trim();
    const url =
      updateUrl?.trim() ||
      (id && id !== "0000000000" ? `https://apps.apple.com/app/id${id}` : null);
    if (url) await Linking.openURL(url).catch(() => {});
    return;
  }
  if (Platform.OS === "android" && ANDROID_PLAY_STORE_PACKAGE) {
    const https =
      updateUrl?.trim() ||
      `https://play.google.com/store/apps/details?id=${encodeURIComponent(ANDROID_PLAY_STORE_PACKAGE)}`;
    await openAndroidPlayListing(https, ANDROID_PLAY_STORE_PACKAGE);
  }
}

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
    const https = `https://play.google.com/store/apps/details?id=${encodeURIComponent(ANDROID_PLAY_STORE_PACKAGE)}`;
    await openAndroidPlayListing(https, ANDROID_PLAY_STORE_PACKAGE);
    return;
  }
  const base = APP_URL?.trim().replace(/\/$/, "");
  if (base) {
    await Linking.openURL(`${base}/download`).catch(() => {});
  }
}
