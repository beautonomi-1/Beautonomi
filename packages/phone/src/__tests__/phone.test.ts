import { describe, it, expect } from "vitest";
import {
  normalizePhoneToE164,
  normalizeFullPhoneToE164,
  isCompleteE164,
  splitValueForPhoneInput,
} from "../index";

describe("normalizePhoneToE164", () => {
  it("returns undefined for empty input", () => {
    expect(normalizePhoneToE164(null)).toBeUndefined();
    expect(normalizePhoneToE164(undefined)).toBeUndefined();
    expect(normalizePhoneToE164("")).toBeUndefined();
    expect(normalizePhoneToE164("   ")).toBeUndefined();
  });

  it("normalizes a valid ZA number with country code", () => {
    const result = normalizePhoneToE164("0821234567", "27");
    expect(result).toBe("+27821234567");
  });

  it("handles already-E.164 input", () => {
    expect(normalizePhoneToE164("+27821234567")).toBe("+27821234567");
  });

  it("handles US number", () => {
    expect(normalizePhoneToE164("2025551234", "1")).toBe("+12025551234");
  });

  it("strips formatting", () => {
    expect(normalizePhoneToE164("+27 82 123 4567")).toBe("+27821234567");
    expect(normalizePhoneToE164("+27-82-123-4567")).toBe("+27821234567");
  });
});

describe("normalizeFullPhoneToE164", () => {
  it("normalizes spaced input", () => {
    const result = normalizeFullPhoneToE164("+27 82 123 4567");
    expect(result).toBe("+27821234567");
  });

  it("returns undefined for empty", () => {
    expect(normalizeFullPhoneToE164("")).toBeUndefined();
  });
});

describe("isCompleteE164", () => {
  it("accepts valid E.164", () => {
    expect(isCompleteE164("+27821234567")).toBe(true);
  });

  it("rejects incomplete", () => {
    expect(isCompleteE164("+2782")).toBe(false);
  });

  it("rejects null/empty", () => {
    expect(isCompleteE164(null)).toBe(false);
    expect(isCompleteE164("")).toBe(false);
  });
});

describe("splitValueForPhoneInput", () => {
  it("splits E.164 into country code and national", () => {
    const result = splitValueForPhoneInput("+27821234567", "+27");
    expect(result.countryCode).toBe("+27");
    expect(result.national).toBe("821234567");
  });

  it("returns default for empty", () => {
    const result = splitValueForPhoneInput(undefined, "+27");
    expect(result.countryCode).toBe("+27");
    expect(result.national).toBe("");
  });
});
