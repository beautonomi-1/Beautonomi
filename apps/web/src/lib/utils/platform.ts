/**
 * Detect the user's platform (iOS, Android, or other)
 */
export function detectPlatform(): "ios" | "android" | "other" {
  if (typeof window === "undefined") {
    return "other";
  }

  const userAgent = window.navigator.userAgent.toLowerCase();

  // Check for iOS
  const isIOS =
    /iphone|ipad|ipod/.test(userAgent) ||
    (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);

  // Check for Android
  const isAndroid = /android/.test(userAgent);

  if (isIOS) {
    return "ios";
  } else if (isAndroid) {
    return "android";
  }

  return "other";
}
