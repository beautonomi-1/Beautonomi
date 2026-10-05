import type { ReadonlyURLSearchParams } from "next/navigation";

/** Query keys that change in-flow navigation only — excluded from flow-key resets. */
export const BOOKING_FLOW_KEY_IGNORE_PARAMS = new Set([
  "step",
  "auth_return",
  "hold_id",
  "embed",
  "reschedule_booking_id",
  "reset",
]);

export type ParsedBookingDeepLink = {
  slug: string;
  serviceIds: string[];
  staffId: string | null;
  anyone: boolean;
  locationId: string | null;
  locationType: "at_home" | "at_salon" | null;
  date: string | null;
  addonIds: string[];
  promoCode: string | null;
  giftCardCode: string | null;
  productIds: string[];
  productId: string | null;
  packageId: string | null;
  campaignId: string | null;
  holdId: string | null;
  rescheduleBookingId: string | null;
  step: string | null;
  embed: boolean;
  authReturn: boolean;
};

function trimOrNull(v: string | null): string | null {
  const t = (v ?? "").trim();
  return t.length > 0 ? t : null;
}

function parseCommaList(raw: string | null): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseBookingDeepLink(
  searchParams: ReadonlyURLSearchParams | URLSearchParams,
): ParsedBookingDeepLink {
  const slug = trimOrNull(
    searchParams.get("slug") ||
      searchParams.get("partnerId") ||
      searchParams.get("provider_id"),
  );

  const singleService =
    trimOrNull(searchParams.get("serviceId")) ||
    trimOrNull(searchParams.get("service"));
  const multi = parseCommaList(searchParams.get("services"));
  const serviceIds =
    multi.length > 0 ? multi : singleService ? [singleService] : [];

  const anyone = searchParams.get("anyone") === "true" || searchParams.get("anyone") === "1";
  const staffRaw = trimOrNull(searchParams.get("staff"));
  const staffId = anyone || staffRaw === "any" ? null : staffRaw;

  const modeRaw = (searchParams.get("mode") || searchParams.get("location_type") || "").trim();
  let locationType: "at_home" | "at_salon" | null = null;
  if (modeRaw === "mobile" || modeRaw === "at_home") locationType = "at_home";
  else if (modeRaw === "salon" || modeRaw === "at_salon") locationType = "at_salon";

  return {
    slug: slug ?? "",
    serviceIds,
    staffId,
    anyone,
    locationId: trimOrNull(searchParams.get("location")),
    locationType,
    date: trimOrNull(searchParams.get("date")),
    addonIds: parseCommaList(searchParams.get("addons")),
    promoCode: trimOrNull(searchParams.get("promo")),
    giftCardCode: trimOrNull(searchParams.get("gift_card")),
    productIds: parseCommaList(searchParams.get("products")),
    productId:
      trimOrNull(searchParams.get("product_id")) ||
      trimOrNull(searchParams.get("product")),
    packageId:
      trimOrNull(searchParams.get("package")) ||
      trimOrNull(searchParams.get("package_id")),
    campaignId: trimOrNull(searchParams.get("campaign_id")),
    holdId: trimOrNull(searchParams.get("hold_id")),
    rescheduleBookingId: trimOrNull(searchParams.get("reschedule_booking_id")),
    step: trimOrNull(searchParams.get("step")),
    embed: searchParams.get("embed") === "1",
    authReturn:
      searchParams.get("auth_return") === "1" ||
      searchParams.get("auth_return") === "true",
  };
}

/**
 * Stable fingerprint for “same booking entry” from the URL.
 * Ignores in-flow params (step, hold, embed, auth_return, reschedule).
 */
export function computeBookingFlowKey(
  searchParams: ReadonlyURLSearchParams | URLSearchParams,
): string {
  const parts: string[] = [];
  const keys = Array.from(searchParams.keys()).sort();
  for (const key of keys) {
    if (BOOKING_FLOW_KEY_IGNORE_PARAMS.has(key)) continue;
    const values = searchParams.getAll(key).sort();
    for (const v of values) {
      parts.push(`${key}=${v.trim()}`);
    }
  }
  return parts.join("&") || "default";
}

/** Whether services, venue mode/location, and staff preference are all specified. */
export function deepLinkSkipsToCalendar(link: ParsedBookingDeepLink): boolean {
  if (!link.slug || link.serviceIds.length === 0) return false;
  const hasVenue = link.locationType != null || link.locationId != null;
  const hasStaff = link.anyone || link.staffId != null;
  return hasVenue && hasStaff;
}
