/**
 * Parse User-Agent to determine OS type. Pure function, safe for server and client.
 */
export type OsType = "ios" | "android" | "huawei" | "desktop" | "other";

export function getOsTypeFromUserAgent(ua: string): OsType {
  if (!ua || typeof ua !== "string") return "desktop";

  const lower = ua.toLowerCase();

  // iOS: iPhone, iPad, iPod
  if (/iphone|ipad|ipod/.test(lower)) return "ios";

  // Android family
  if (/android/.test(lower)) {
    // Huawei: Android + HUAWEI / Huawei / EMUI in UA
    if (/huawei|emui/i.test(ua)) return "huawei";
    return "android";
  }

  // Desktop: common desktop patterns (no mobile)
  if (/windows nt|macintosh|linux|ubuntu|cros|msie|trident|edg\//i.test(ua)) {
    return "desktop";
  }

  return "other";
}
