import { describe, expect, it } from "vitest";
import { pickDefaultPhoneIso } from "@/lib/user-default-phone-dial";

describe("pickDefaultPhoneIso", () => {
  it("prefers the tenant market over visitor geo (ZA tenant + US visitor → ZA)", () => {
    expect(
      pickDefaultPhoneIso({ visitorCountryCode: "US", tenantCountryCode: "ZA" }),
    ).toBe("ZA");
  });

  it("falls back to visitor geo when the tenant market is unknown", () => {
    expect(pickDefaultPhoneIso({ visitorCountryCode: "GB", tenantCountryCode: null })).toBe("GB");
  });

  it("ignores placeholder CDN codes", () => {
    expect(pickDefaultPhoneIso({ visitorCountryCode: "XX", tenantCountryCode: null })).toBeUndefined();
    expect(pickDefaultPhoneIso({ visitorCountryCode: "T1", tenantCountryCode: "za" })).toBe("ZA");
  });
});
