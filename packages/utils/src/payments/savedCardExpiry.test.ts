import { describe, expect, it } from "vitest";
import {
  formatSavedCardExpiry,
  getSavedCardExpiryStatus,
  isSavedCardExpired,
} from "./savedCardExpiry";

describe("formatSavedCardExpiry", () => {
  it("pads single-digit months and trims year to two digits", () => {
    expect(formatSavedCardExpiry({ expiry_month: 5, expiry_year: 2027 })).toBe("05/27");
  });

  it("accepts string inputs", () => {
    expect(formatSavedCardExpiry({ expiry_month: "12", expiry_year: "2030" })).toBe("12/30");
  });

  it("returns empty string when month or year is missing or invalid", () => {
    expect(formatSavedCardExpiry({ expiry_month: 0, expiry_year: 2027 })).toBe("");
    expect(formatSavedCardExpiry({ expiry_month: 13, expiry_year: 2027 })).toBe("");
    expect(formatSavedCardExpiry({ expiry_month: 5, expiry_year: null })).toBe("");
    expect(formatSavedCardExpiry({})).toBe("");
  });

  it("expands two-digit years to 20xx", () => {
    expect(formatSavedCardExpiry({ expiry_month: 1, expiry_year: 27 })).toBe("01/27");
  });
});

describe("getSavedCardExpiryStatus", () => {
  const now = new Date("2026-05-19T09:00:00.000Z").getTime();

  it("treats a card as still active throughout the expiry month", () => {
    const status = getSavedCardExpiryStatus(
      { expiry_month: 5, expiry_year: 2026 },
      { now }
    );
    expect(status.hasExpiry).toBe(true);
    expect(status.label).toBe("05/26");
    expect(status.isExpired).toBe(false);
    expect(status.isExpiringSoon).toBe(true);
  });

  it("marks a card expired once the month after has started", () => {
    const status = getSavedCardExpiryStatus(
      { expiry_month: 4, expiry_year: 2026 },
      { now }
    );
    expect(status.isExpired).toBe(true);
    expect(status.isExpiringSoon).toBe(false);
  });

  it("does not flag cards far in the future as expiring soon", () => {
    const status = getSavedCardExpiryStatus(
      { expiry_month: 12, expiry_year: 2030 },
      { now }
    );
    expect(status.isExpired).toBe(false);
    expect(status.isExpiringSoon).toBe(false);
  });

  it("honors a custom expiringSoonDays window", () => {
    const status = getSavedCardExpiryStatus(
      { expiry_month: 7, expiry_year: 2026 },
      { now, expiringSoonDays: 30 }
    );
    expect(status.isExpired).toBe(false);
    expect(status.isExpiringSoon).toBe(false);
  });

  it("reports no expiry when fields are missing", () => {
    const status = getSavedCardExpiryStatus({}, { now });
    expect(status.hasExpiry).toBe(false);
    expect(status.label).toBe("");
    expect(status.isExpired).toBe(false);
    expect(status.isExpiringSoon).toBe(false);
  });
});

describe("isSavedCardExpired", () => {
  it("returns true once the expiry month has passed", () => {
    const now = new Date("2026-06-01T00:00:00.000Z").getTime();
    expect(isSavedCardExpired({ expiry_month: 5, expiry_year: 2026 }, now)).toBe(true);
  });

  it("returns false on the last day of the expiry month", () => {
    const now = new Date("2026-05-31T23:59:59.000Z").getTime();
    expect(isSavedCardExpired({ expiry_month: 5, expiry_year: 2026 }, now)).toBe(false);
  });

  it("returns false when expiry is unknown", () => {
    expect(isSavedCardExpired({})).toBe(false);
  });
});
