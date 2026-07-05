import { describe, expect, it } from "vitest";
import { alpha2ToAlpha3, ISO3166_ALPHA2_TO_ALPHA3 } from "./iso3166-alpha3";
import { STATIC_VERIFICATION_COUNTRIES } from "./verification-country";

describe("alpha2ToAlpha3", () => {
  it("maps common verification countries to alpha-3", () => {
    expect(alpha2ToAlpha3("ZA")).toBe("ZAF");
    expect(alpha2ToAlpha3("GH")).toBe("GHA");
    expect(alpha2ToAlpha3("ET")).toBe("ETH");
    expect(alpha2ToAlpha3("US")).toBe("USA");
  });

  it("passes through existing alpha-3 codes", () => {
    expect(alpha2ToAlpha3("ZAF")).toBe("ZAF");
  });

  it("returns undefined for unknown codes", () => {
    expect(alpha2ToAlpha3("XX")).toBeUndefined();
    expect(alpha2ToAlpha3("")).toBeUndefined();
  });

  it("covers every static verification country list entry", () => {
    for (const country of STATIC_VERIFICATION_COUNTRIES) {
      expect(ISO3166_ALPHA2_TO_ALPHA3[country.code], country.code).toBeDefined();
      expect(alpha2ToAlpha3(country.code)).toHaveLength(3);
    }
  });
});
