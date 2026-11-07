/** iOS shares `{ message, url }`; Android should embed URL only in `message` to avoid duplicates. */
export function buildShareBookingLinkPayload(
  platformOs: "ios" | "android" | "web" | string,
  url: string,
  message: string,
): { message: string; url?: string } {
  const withUrl = message.includes(url) ? message : `${message.trim()} ${url}`.trim();
  return platformOs === "ios" ? { message: withUrl, url } : { message: withUrl };
}
