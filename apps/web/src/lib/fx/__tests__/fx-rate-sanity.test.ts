import { describe, expect, it } from "vitest";
import { isUsdZarSane, isCcyZarSane, passesIngestSanity } from "../fx-rate-sanity";

describe("fx-rate-sanity", () => {
  it("bounds USD/ZAR", () => {
    expect(isUsdZarSane(18)).toBe(true);
    expect(isUsdZarSane(4)).toBe(false);
    expect(isUsdZarSane(41)).toBe(false);
  });

  it("bounds generic ccy/ZAR", () => {
    expect(isCcyZarSane(0.05)).toBe(true);
    expect(isCcyZarSane(0)).toBe(false);
    expect(isCcyZarSane(2000)).toBe(false);
  });

  it("rejects non-finite and zero", () => {
    expect(passesIngestSanity("USD", "ZAR", 0)).toBe(false);
    expect(passesIngestSanity("KES", "ZAR", Number.NaN)).toBe(false);
  });

  it("does not invent 1.0 for bad USD/ZAR", () => {
    expect(passesIngestSanity("USD", "ZAR", 1)).toBe(false);
  });
});
