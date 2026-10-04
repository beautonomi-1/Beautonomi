import type { ExpressPrefill } from "@/lib/express-booking/prefill";
import { productCartToQueryParam } from "@/lib/express-booking/prefill";

export type ExpressLinkBookingSource = {
  provider_slug: string;
  service_ids?: string[];
  staff_ids?: string[];
  location_id?: string | null;
  location_type?: string | null;
  prefill?: ExpressPrefill;
};

export type ExpressLinkBookingQueryOptions = {
  embed?: boolean;
  ref?: string | null;
};

/** Build `/booking?…` search params from a resolved express short link. */
export function buildExpressLinkBookingSearchParams(
  data: ExpressLinkBookingSource,
  options: ExpressLinkBookingQueryOptions = {},
): URLSearchParams {
  const q = new URLSearchParams();
  q.set("slug", data.provider_slug);

  if (data.service_ids?.length) {
    if (data.service_ids.length === 1) {
      q.set("service", data.service_ids[0]);
    } else {
      q.set("services", data.service_ids.join(","));
    }
  }
  if (data.staff_ids?.[0]) q.set("staff", data.staff_ids[0]);
  if (data.location_type === "at_home") {
    q.set("location_type", "at_home");
  } else if (data.location_type === "at_salon" || data.location_id) {
    q.set("location_type", "at_salon");
    if (data.location_id) q.set("location", data.location_id);
  }
  if (options.embed) q.set("embed", "1");
  const refParam = options.ref?.trim();
  if (refParam) q.set("ref", refParam);

  const pf = data.prefill;
  if (pf?.addon_ids?.length) q.set("addons", pf.addon_ids.join(","));
  if (pf?.promotion_code?.trim()) q.set("promo", pf.promotion_code.trim());
  if (pf?.gift_card_code?.trim()) q.set("gift_card", pf.gift_card_code.trim());
  if (pf?.product_cart?.length) q.set("products", productCartToQueryParam(pf.product_cart));

  return q;
}

export function expressLinkBookingPath(
  data: ExpressLinkBookingSource,
  options?: ExpressLinkBookingQueryOptions,
): string {
  const q = buildExpressLinkBookingSearchParams(data, options).toString();
  return `/booking${q ? `?${q}` : ""}`;
}
