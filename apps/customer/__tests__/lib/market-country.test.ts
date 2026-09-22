import { resolveDefaultCountryName, resolveMarketCountryIso } from "@/lib/market-country";

describe("market-country", () => {
  it("prefers active_market_country from the config bundle", () => {
    expect(
      resolveMarketCountryIso({
        active_market_country: "za",
        tenant_region: { code: "US", name: "United States", default_currency: "USD", default_language: "en", timezone: "UTC", phone_country_code: "+1" },
      }),
    ).toBe("ZA");
  });

  it("falls back to tenant region code then ZA shop default", () => {
    expect(
      resolveMarketCountryIso({
        tenant_region: { code: "gh", name: "Ghana", default_currency: "GHS", default_language: "en", timezone: "UTC", phone_country_code: "+233" },
      }),
    ).toBe("GH");

    expect(resolveMarketCountryIso(null)).toBe("ZA");
  });

  it("resolves default country name from tenant region", () => {
    expect(
      resolveDefaultCountryName({
        tenant_region: { code: "ZA", name: "South Africa", default_currency: "ZAR", default_language: "en", timezone: "Africa/Johannesburg", phone_country_code: "+27" },
      }),
    ).toBe("South Africa");
  });

  it("maps ISO fallback to a display name when tenant region name is missing", () => {
    expect(resolveDefaultCountryName({ active_market_country: "ZA" })).toBe("South Africa");
  });

  it("normalizes country names via countryFilterIso2FromStorage", () => {
    expect(
      resolveMarketCountryIso({
        tenant_region: {
          name: "South Africa",
          code: "",
          default_currency: "ZAR",
          default_language: "en",
          timezone: "Africa/Johannesburg",
          phone_country_code: "+27",
        },
      }),
    ).toBe("ZA");
  });
});
