import { describe, expect, it } from "vitest";
import {
  computeBookingFlowKey,
  deepLinkSkipsToCalendar,
  parseBookingDeepLink,
} from "../parse-booking-deep-link";

describe("parseBookingDeepLink", () => {
  it("parses slug and multiple services", () => {
    const sp = new URLSearchParams(
      "slug=salon-a&services=s1,s2&staff=st1&location=loc1&location_type=at_salon&date=2026-05-01&addons=a1&promo=SAVE&embed=1",
    );
    const p = parseBookingDeepLink(sp);
    expect(p.slug).toBe("salon-a");
    expect(p.serviceIds).toEqual(["s1", "s2"]);
    expect(p.staffId).toBe("st1");
    expect(p.locationId).toBe("loc1");
    expect(p.locationType).toBe("at_salon");
    expect(p.date).toBe("2026-05-01");
    expect(p.addonIds).toEqual(["a1"]);
    expect(p.promoCode).toBe("SAVE");
    expect(p.embed).toBe(true);
  });

  it("treats anyone=true as no staff id", () => {
    const p = parseBookingDeepLink(new URLSearchParams("slug=x&anyone=1&service=s1"));
    expect(p.anyone).toBe(true);
    expect(p.staffId).toBeNull();
  });
});

describe("computeBookingFlowKey", () => {
  it("ignores step and hold_id", () => {
    const a = computeBookingFlowKey(
      new URLSearchParams("slug=a&service=s1&step=calendar&hold_id=h1"),
    );
    const b = computeBookingFlowKey(new URLSearchParams("slug=a&service=s1&step=pay"));
    expect(a).toBe(b);
  });

  it("changes when slug changes", () => {
    const a = computeBookingFlowKey(new URLSearchParams("slug=a&service=s1"));
    const b = computeBookingFlowKey(new URLSearchParams("slug=b&service=s1"));
    expect(a).not.toBe(b);
  });
});

describe("deepLinkSkipsToCalendar", () => {
  it("requires services venue and staff", () => {
    expect(
      deepLinkSkipsToCalendar({
        slug: "x",
        serviceIds: ["s"],
        staffId: null,
        anyone: true,
        locationId: "l",
        locationType: "at_salon",
        date: null,
        addonIds: [],
        promoCode: null,
        giftCardCode: null,
        productIds: [],
        productId: null,
        packageId: null,
        campaignId: null,
        holdId: null,
        rescheduleBookingId: null,
        step: null,
        embed: false,
        authReturn: false,
      }),
    ).toBe(true);
  });
});
