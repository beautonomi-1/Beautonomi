import { describe, expect, it } from "vitest";

import { normalizeProviderTimezone } from "../dates";

/**
 * §Launch-audit 2026-04-18: these tests lock down the contract shared
 * between the web API (`apps/web/src/lib/availability/time-utils.ts`,
 * which re-implements the same logic) and the two RN apps. If you
 * change one, update the other.
 *
 * The contract is intentionally loose about *which* form of a zone
 * comes out (some runtimes' `Intl.DateTimeFormat` accept `"+02:00"`
 * verbatim, others require `"Etc/GMT-2"`), but guarantees two things:
 *
 *   1. Valid IANA / Intl-acceptable inputs are preserved.
 *   2. The output is always round-trippable through `Intl.DateTimeFormat`,
 *      or `null` — never an Intl-poisonous string.
 */
describe("normalizeProviderTimezone", () => {
  const isIntlZoneValid = (tz: string): boolean => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  };

  it("accepts valid IANA identifiers verbatim", () => {
    expect(normalizeProviderTimezone("Africa/Johannesburg")).toBe(
      "Africa/Johannesburg",
    );
    expect(normalizeProviderTimezone("America/New_York")).toBe(
      "America/New_York",
    );
    expect(normalizeProviderTimezone("UTC")).toBe("UTC");
  });

  it("trims whitespace before validating", () => {
    expect(normalizeProviderTimezone("  Europe/London  ")).toBe(
      "Europe/London",
    );
  });

  it("returns null for nullish or empty input", () => {
    expect(normalizeProviderTimezone(null)).toBeNull();
    expect(normalizeProviderTimezone(undefined)).toBeNull();
    expect(normalizeProviderTimezone("")).toBeNull();
    expect(normalizeProviderTimezone("   ")).toBeNull();
  });

  it('rewrites Intl-hostile forms like "GMT+2" to Etc/GMT-N (POSIX sign flip)', () => {
    // These fail `new Intl.DateTimeFormat({ timeZone: "GMT+2" })` in every
    // supported runtime, so the normaliser must rewrite them.
    expect(normalizeProviderTimezone("GMT+2")).toBe("Etc/GMT-2");
    expect(normalizeProviderTimezone("UTC+2")).toBe("Etc/GMT-2");
    expect(normalizeProviderTimezone("GMT-5")).toBe("Etc/GMT+5");
    expect(normalizeProviderTimezone("UTC-05")).toBe("Etc/GMT+5");
  });

  it("always returns a value that round-trips through Intl (or null)", () => {
    const inputs = [
      "Africa/Johannesburg",
      "America/New_York",
      "GMT+2",
      "UTC+2",
      "GMT-5",
      "UTC-05",
      "+02:00",
      "-05:00",
      "+0200",
      "+02",
      "+05:30",
      "UTC",
    ];
    for (const input of inputs) {
      const out = normalizeProviderTimezone(input);
      if (out !== null) {
        expect(isIntlZoneValid(out)).toBe(true);
      }
    }
  });

  it("rejects nonsensical values", () => {
    expect(normalizeProviderTimezone("not-a-zone")).toBeNull();
    expect(normalizeProviderTimezone("GMT+99")).toBeNull();
    expect(normalizeProviderTimezone("Mars/Phobos")).toBeNull();
  });
});
