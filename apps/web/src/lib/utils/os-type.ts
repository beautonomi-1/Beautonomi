/**
 * Parse User-Agent (and optional client hints) to determine OS type. Pure UA logic is safe for server and client.
 *
 * Order matters: classify Apple (iPhone, iPad, iPod, iPadOS) before Harmony/Android heuristics so nothing
 * Apple is ever routed to AppGallery or mis-scored as generic Android.
 */
export type OsType = "ios" | "android" | "huawei" | "desktop" | "other";

/**
 * Apple mobile / tablet WebKit UAs. Conservative: any strong Apple signal wins before Huawei/Android.
 */
function isAppleDeviceUa(ua: string, lower: string): boolean {
  // Device tokens (covers iPhone, iPad, iPod, and typical WebView wrappers)
  if (/iphone|ipod|ipad/.test(lower)) return true;
  if (/\(iphone;|\(ipad;|\(ipod;/i.test(ua)) return true;

  if (/\bcpu iphone os\b/.test(lower)) return true;
  // iPadOS line: "CPU OS 16_0 like Mac OS X" (distinct from iPhone's "CPU iPhone OS")
  if (/\bcpu os [\d_]+ like mac os x\b/i.test(lower)) return true;

  // iOS browsers on iPhone/iPad (CriOS, FxiOS, EdgiOS, OPiOS) — require device token to avoid desktop Chrome
  if (/\bcrios\/|fxios\/|edgios\/|opios\//i.test(ua) && /iphone|ipad|ipod/.test(lower)) return true;

  // iPad / iPhone Safari uses "like Mac OS X" in the OS fragment; real desktop macOS Safari does not use this iOS-style CPU line
  if (/\blike mac os x\b/i.test(ua) && /applewebkit/i.test(ua) && !/android/i.test(lower)) {
    if (/\bcpu (?:iphone )?os [\d_]+ like mac os x\b/i.test(lower)) return true;
  }

  return false;
}

/** Huawei / AppGallery-oriented Android (Honor, EMUI, HMS, Huawei browsers). Never true when Apple device. */
function isHuaweiEcosystemUa(ua: string, lower: string): boolean {
  if (isAppleDeviceUa(ua, lower)) return false;
  return (
    /\b(?:huawei|honor|hisilicon)\b/i.test(ua) ||
    /\bemui\b/i.test(ua) ||
    /\bharmonyos\b/i.test(ua) ||
    /\bopenharmony\b/i.test(ua) ||
    /\bhmscore\b/i.test(ua) ||
    /\bhmsagent\b/i.test(ua) ||
    /\bhuaweibrowser\b/i.test(ua) ||
    /\bhwbrowser\b/i.test(ua) ||
    /\bhm\s*os\b/i.test(ua)
  );
}

/** Standalone HarmonyOS / OpenHarmony UAs that may omit "Android". Skip if UA is clearly Apple WebKit mobile. */
function isStandaloneHarmonyOsUa(ua: string, lower: string): boolean {
  if (isAppleDeviceUa(ua, lower)) return false;
  return /\bopenharmony\b/i.test(ua) || /\bharmonyos\b/i.test(ua);
}

export function getOsTypeFromUserAgent(ua: string): OsType {
  if (!ua || typeof ua !== "string") return "desktop";

  const lower = ua.toLowerCase();

  if (isAppleDeviceUa(ua, lower)) return "ios";

  if (isStandaloneHarmonyOsUa(ua, lower)) return "huawei";

  // iPad Safari "Request Desktop Website": Macintosh + Mobile Safari (still iOS)
  if ((/macintosh|mac os x/.test(lower) || /macintosh/.test(lower)) && /mobile|like mac os x/i.test(ua)) {
    return "ios";
  }

  // Android family — never Huawei if Apple signals appear (defensive for malformed UAs)
  if (/android/.test(lower)) {
    if (isAppleDeviceUa(ua, lower)) return "ios";
    if (isHuaweiEcosystemUa(ua, lower)) return "huawei";
    return "android";
  }

  if (/windows nt|macintosh|linux|ubuntu|cros|msie|trident|edg\//i.test(ua)) {
    return "desktop";
  }

  return "other";
}

function isTouchMacLikeTablet(nav: Navigator, ua: string): boolean {
  if (nav.platform !== "MacIntel") return false;
  if (typeof nav.maxTouchPoints !== "number" || nav.maxTouchPoints <= 1) return false;
  return !/android/i.test(ua);
}

/**
 * Best-effort OS detection in the browser (Client Hints + iPad desktop heuristic + UA).
 * Prefer this over getOsTypeFromUserAgent alone for download / store routing.
 */
export function getOsTypeFromNavigator(nav: Navigator): OsType {
  if (typeof nav === "undefined" || !nav?.userAgent) return "desktop";

  const ua = nav.userAgent;
  const lower = ua.toLowerCase();

  const uaData = (nav as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
  const chPlatform = uaData?.platform;

  if (chPlatform === "iOS" || chPlatform === "iPadOS") return "ios";

  // iPad with "desktop" mode often reports macOS to sites; treat touch Mac as iPad/iOS, not desktop/Android
  if (chPlatform === "macOS" && isTouchMacLikeTablet(nav, ua)) {
    return "ios";
  }

  if (chPlatform === "Android") {
    if (isAppleDeviceUa(ua, lower)) return "ios";
    if (/android/i.test(ua) && isHuaweiEcosystemUa(ua, lower)) return "huawei";
    if (/android/i.test(ua)) return "android";
    return getOsTypeFromUserAgent(ua);
  }

  if (isTouchMacLikeTablet(nav, ua)) {
    return "ios";
  }

  return getOsTypeFromUserAgent(ua);
}
