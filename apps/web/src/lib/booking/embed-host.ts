import {
  createBookingEmbedMessage,
  isBookingEmbedMessage,
  type BookingEmbedMessage,
  type BookingEmbedMessageType,
} from "@beautonomi/utils";

export function isLikelyFramed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

/** Salon widget: `?embed=1` or a cross-origin iframe. Hide chrome that blanks or covers the flow. */
export function isBookingEmbedSurface(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (new URLSearchParams(window.location.search).get("embed") === "1") return true;
  } catch {
    /* ignore */
  }
  return isLikelyFramed();
}

export function postBookingEmbedMessage(
  type: BookingEmbedMessageType,
  extra?: Omit<BookingEmbedMessage, "source" | "type">,
): void {
  if (typeof window === "undefined") return;
  const payload = createBookingEmbedMessage(type, extra);
  try {
    window.parent?.postMessage(payload, "*");
  } catch {
    // Host may be cross-origin; wildcard target is required for third-party salon sites.
  }
}

/** Resolve relative paths against Beautonomi, not the salon page that owns window.top. */
export function absoluteEmbedBreakoutUrl(url: string): string {
  if (typeof window === "undefined") return url;
  try {
    return new URL(url, window.location.origin).href;
  } catch {
    return url;
  }
}

export function navigateForEmbedBreakout(url: string, type: "payment_redirect" | "auth_required"): void {
  const absoluteUrl = absoluteEmbedBreakoutUrl(url);
  postBookingEmbedMessage(type, { url: absoluteUrl });
  if (typeof window === "undefined") return;
  if (isLikelyFramed()) {
    try {
      if (window.top) {
        window.top.location.href = absoluteUrl;
        return;
      }
    } catch {
      // Parent refused navigation; host script should honour the postMessage.
    }
  }
  window.location.href = absoluteUrl;
}

export { isBookingEmbedMessage };
