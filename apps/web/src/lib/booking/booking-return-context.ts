import { sanitizeRelativeRedirect } from "@/lib/auth/post-login-return-path";
import { parseBookingDeepLink } from "@/lib/booking/parse-booking-deep-link";

export type BookingReturnContext = {
  isBookingReturn: true;
  slug: string | null;
  /** i18n key for step-specific subtitle (shared login/signup prefix). */
  stepLabelKey: string;
  continueHref: string;
  authReturn: boolean;
};

/** Maps booking URL `step` query values to user-facing copy keys (see booking-flow syncStepQueryParam). */
export function bookingReturnStepLabelKey(step: string | null): string {
  switch (step) {
    case "time":
      return "web.auth.bookingReturn.stepTime";
    case "pay":
      return "web.auth.bookingReturn.stepPay";
    case "details":
      return "web.auth.bookingReturn.stepDetails";
    case "services":
      return "web.auth.bookingReturn.stepServices";
    case "venue":
      return "web.auth.bookingReturn.stepVenue";
    default:
      return "web.auth.bookingReturn.stepDefault";
  }
}

function splitRelativePathAndQuery(safeNext: string): { pathname: string; searchParams: URLSearchParams } {
  const qIndex = safeNext.indexOf("?");
  const pathname = qIndex >= 0 ? safeNext.slice(0, qIndex) : safeNext;
  const search = qIndex >= 0 ? safeNext.slice(qIndex + 1) : "";
  return { pathname, searchParams: new URLSearchParams(search) };
}

function isBookingReturnPathname(pathname: string): boolean {
  return pathname === "/booking" || pathname.startsWith("/booking/");
}

/**
 * When `?next=` is a sanitized relative booking URL, returns context for login/signup return UX.
 */
export function resolveBookingReturnContext(
  rawNext: string | null | undefined,
): BookingReturnContext | null {
  const continueHref = sanitizeRelativeRedirect(rawNext);
  if (!continueHref) return null;

  const { pathname, searchParams } = splitRelativePathAndQuery(continueHref);
  if (!isBookingReturnPathname(pathname)) return null;

  const parsed = parseBookingDeepLink(searchParams);
  return {
    isBookingReturn: true,
    slug: parsed.slug || null,
    stepLabelKey: bookingReturnStepLabelKey(parsed.step),
    continueHref,
    authReturn: parsed.authReturn,
  };
}
