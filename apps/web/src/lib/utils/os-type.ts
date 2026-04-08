/**
 * Parse User-Agent to determine OS type. Pure function, safe for server and client.
 *
 * Order matters: HarmonyOS/OpenHarmony (non-Android UAs), iOS & iPad desktop mode,
 * then Android with Huawei ecosystem heuristics, then desktop.
 */
export type OsType = "ios" | "android" | "huawei" | "desktop" | "other";

/** Huawei / AppGallery-oriented devices (includes many Honor + HMS devices on Android). */
function isHuaweiEcosystemUa(ua: string, lower: string): boolean {
  return (
    /huawei|honor|emui|harmonyos|openharmony|hmscore|hmsagent|huaweibrowser|hwbrowser|hisilicon/i.test(ua) ||
    /\bhm\s*os\b/i.test(ua)
  );
}

export function getOsTypeFromUserAgent(ua: string): OsType {
  if (!ua || typeof ua !== "string") return "desktop";

  const lower = ua.toLowerCase();

  // HarmonyOS / OpenHarmony (may not include "Android")
  if (/openharmony|harmonyos/i.test(ua)) return "huawei";

  // iOS: iPhone, iPod
  if (/iphone|ipod/.test(lower)) return "ios";

  // iPad (including iPadOS 13+ "desktop" Safari UA: Macintosh + Mobile)
  if (/ipad/.test(lower)) return "ios";
  if ((/macintosh|mac os x/.test(lower) || /macintosh/.test(lower)) && /mobile|like mac os x/i.test(ua)) {
    return "ios";
  }

  // Android family
  if (/android/.test(lower)) {
    if (isHuaweiEcosystemUa(ua, lower)) return "huawei";
    return "android";
  }

  // Desktop: common desktop patterns (no mobile)
  if (/windows nt|macintosh|linux|ubuntu|cros|msie|trident|edg\//i.test(ua)) {
    return "desktop";
  }

  return "other";
}
