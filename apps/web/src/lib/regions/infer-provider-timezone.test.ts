import { describe, expect, it } from "vitest";
import {
  inferProviderTimezoneFromLocation,
  parseCountryToIso2,
} from "./infer-provider-timezone";

describe("parseCountryToIso2", () => {
  it("maps South Africa and ZA", () => {
    expect(parseCountryToIso2("South Africa")).toBe("ZA");
    expect(parseCountryToIso2("south africa")).toBe("ZA");
    expect(parseCountryToIso2("ZA")).toBe("ZA");
    expect(parseCountryToIso2("za")).toBe("ZA");
    expect(parseCountryToIso2("RSA")).toBe("ZA");
  });

  it("parses trailing ISO2 in parentheses", () => {
    expect(parseCountryToIso2("South Africa (ZA)")).toBe("ZA");
  });

  it("returns null for empty or unknown", () => {
    expect(parseCountryToIso2("")).toBeNull();
    expect(parseCountryToIso2(null)).toBeNull();
    expect(parseCountryToIso2("United States")).toBeNull();
  });
});

describe("inferProviderTimezoneFromLocation", () => {
  it("maps ZA to Africa/Johannesburg", () => {
    expect(inferProviderTimezoneFromLocation({ country: "ZA" })).toBe("Africa/Johannesburg");
    expect(inferProviderTimezoneFromLocation({ country: "South Africa" })).toBe(
      "Africa/Johannesburg",
    );
  });

  it("returns null for multi-zone countries without coordinates", () => {
    expect(inferProviderTimezoneFromLocation({ country: "US" })).toBeNull();
    expect(inferProviderTimezoneFromLocation({ country: "AU" })).toBeNull();
  });

  it("uses coordinates for a stable point in South Africa (Johannesburg area)", () => {
    expect(
      inferProviderTimezoneFromLocation({
        country: "US",
        latitude: -26.2,
        longitude: 28.04,
      }),
    ).toBe("Africa/Johannesburg");
  });
});
