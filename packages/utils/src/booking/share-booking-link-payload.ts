/**
 * One URL per share: when the link is already in `message`, do not also set `url`
 * (WhatsApp, Messages, Mail, and web `navigator.share` append the second field).
 */
export function buildShareBookingLinkPayload(
  platformOs: "ios" | "android" | "web" | string,
  url: string,
  message: string,
): { message: string; url?: string } {
  const withUrl = message.includes(url) ? message : `${message.trim()} ${url}`.trim();
  if (withUrl.includes(url)) {
    return { message: withUrl };
  }
  return platformOs === "ios" ? { message: withUrl, url } : { message: withUrl };
}

/** Web `navigator.share` — same single-link rule as native Share. */
export function buildWebNavigatorSharePayload(
  url: string,
  message: string,
): { text: string; url?: string } {
  const { message: text, url: extra } = buildShareBookingLinkPayload("web", url, message);
  return extra ? { text, url: extra } : { text };
}
