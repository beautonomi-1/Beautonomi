import { describe, expect, it } from "vitest";
import {
  findVerificationCountry,
  formatVerificationCountryDisplay,
  mergeVerificationCountries,
  resolveDefaultVerificationCountryIso,
  STATIC_VERIFICATION_COUNTRIES,
} from "./verification-country";

describe("mergeVerificationCountries", () => {
  it("merges API rows over the static fallback", () => {
    const merged = mergeVerificationCountries([
      { code: "ZA", name: "Republic of South Africa" },
      { code: "ZZZ", name: "Invalid" },
    ]);
    const za = merged.find((c) => c.code === "ZA");
    expect(za?.name).toBe("Republic of South Africa");
    expect(merged.some((c) => c.code === "ZZZ")).toBe(false);
  });
});

describe("findVerificationCountry", () => {
  it("resolves ISO codes and display names", () => {
    expect(findVerificationCountry(STATIC_VERIFICATION_COUNTRIES, "ZA")?.name).toBe(
      "South Africa",
    );
    expect(findVerificationCountry(STATIC_VERIFICATION_COUNTRIES, "South Africa")?.code).toBe(
      "ZA",
    );
  });
});

describe("formatVerificationCountryDisplay", () => {
  it("shows the country name for ISO codes and preserves legacy text", () => {
    expect(formatVerificationCountryDisplay("ZA")).toBe("South Africa");
    expect(formatVerificationCountryDisplay("Some Legacy Text")).toBe("Some Legacy Text");
  });
});

describe("resolveDefaultVerificationCountryIso", () => {
  it("prefers tenant region code, then name, then device", () => {
    expect(
      resolveDefaultVerificationCountryIso({
        tenantRegionCode: "ke",
        tenantRegionName: "South Africa",
        deviceIso: "US",
      }),
    ).toBe("KE");
    expect(
      resolveDefaultVerificationCountryIso({
        tenantRegionName: "South Africa",
        deviceIso: "US",
      }),
    ).toBe("ZA");
    expect(resolveDefaultVerificationCountryIso({ deviceIso: "gb" })).toBe("GB");
    expect(resolveDefaultVerificationCountryIso({})).toBe("ZA");
  });
});
