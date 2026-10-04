import { describe, expect, it } from "vitest";
import {
  bookContinueRedirectPath,
  bookOnDemandRedirectPath,
  bookSlugRedirectPath,
  buildBookContinueRedirectQuery,
  buildBookSlugRedirectQuery,
  legacySearchParamsToQuery,
} from "../legacy-book-redirects";
import {
  buildExpressLinkBookingSearchParams,
  expressLinkBookingPath,
} from "@/lib/express-booking/build-express-link-booking-query";

describe("legacy-book-redirects", () => {
  it("maps /book/{slug} query to /booking with slug set", () => {
    const q = buildBookSlugRedirectQuery("luxe-salon", {
      service: "svc-1",
      embed: "1",
      slug: "ignored",
    });
    expect(q.get("slug")).toBe("luxe-salon");
    expect(q.get("service")).toBe("svc-1");
    expect(q.get("embed")).toBe("1");
    expect(bookSlugRedirectPath("luxe-salon", { promo: "SAVE10" })).toBe(
      "/booking?slug=luxe-salon&promo=SAVE10",
    );
  });

  it("preserves repeated keys when copying legacy search params", () => {
    const q = legacySearchParamsToQuery({ tag: ["a", "b"], empty: "" });
    expect(q.getAll("tag")).toEqual(["a", "b"]);
    expect(q.has("empty")).toBe(false);
  });

  it("maps on-demand legacy paths", () => {
    expect(bookOnDemandRedirectPath("waiting", { request_id: "r1" })).toBe(
      "/booking/on-demand/waiting?request_id=r1",
    );
  });

  it("builds continue redirect with hold and passthrough params", () => {
    const q = buildBookContinueRedirectQuery({
      holdId: "hold-abc",
      providerSlug: "salon-x",
      embed: true,
      sp: { hold_id: "hold-abc", utm_source: "email", step: "ignored" },
    });
    expect(q.get("slug")).toBe("salon-x");
    expect(q.get("hold_id")).toBe("hold-abc");
    expect(q.get("step")).toBe("pay");
    expect(q.get("embed")).toBe("1");
    expect(q.get("utm_source")).toBe("email");
    expect(bookContinueRedirectPath({
      holdId: "h1",
      providerSlug: "p1",
      embed: false,
      sp: {},
    })).toBe("/booking?slug=p1&hold_id=h1&step=pay");
  });
});

describe("buildExpressLinkBookingSearchParams", () => {
  it("maps express link payload to booking deep link", () => {
    expect(
      expressLinkBookingPath(
        {
          provider_slug: "salon-a",
          service_ids: ["s1", "s2"],
          staff_ids: ["st1"],
          location_type: "at_salon",
          location_id: "loc-1",
          prefill: {
            addon_ids: ["a1"],
            promotion_code: " PROMO ",
            gift_card_code: " GIFT ",
            product_cart: [
              {
                product_id: "11111111-1111-4111-8111-111111111111",
                quantity: 2,
              },
            ],
          },
        },
        { embed: true, ref: "ig" },
      ),
    ).toContain("slug=salon-a");
    const q = buildExpressLinkBookingSearchParams(
      {
        provider_slug: "salon-a",
        service_ids: ["s1", "s2"],
        staff_ids: ["st1"],
        location_type: "at_home",
      },
      { embed: true },
    );
    expect(q.get("services")).toBe("s1,s2");
    expect(q.get("staff")).toBe("st1");
    expect(q.get("location_type")).toBe("at_home");
    expect(q.get("location")).toBeNull();
    expect(q.get("embed")).toBe("1");
  });
});
