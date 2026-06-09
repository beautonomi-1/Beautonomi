import { describe, expect, it } from "vitest";
import { isBadgeExpired, resolveActiveBadge } from "../active-badge";

const sampleBadge = { id: "b1", name: "Silver Provider", tier: 3 };

describe("isBadgeExpired", () => {
  it("returns false when expiry is null or undefined (no maintenance window)", () => {
    expect(isBadgeExpired(null)).toBe(false);
    expect(isBadgeExpired(undefined)).toBe(false);
  });

  it("returns false when expiry is in the future", () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    expect(isBadgeExpired(future)).toBe(false);
  });

  it("returns true when expiry is in the past", () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(isBadgeExpired(past)).toBe(true);
  });

  it("returns false for unparseable expiry strings", () => {
    expect(isBadgeExpired("not-a-date")).toBe(false);
  });
});

describe("resolveActiveBadge", () => {
  it("returns null when badge is missing", () => {
    expect(resolveActiveBadge(null, null)).toBeNull();
    expect(resolveActiveBadge(undefined, "2026-12-31T00:00:00.000Z")).toBeNull();
  });

  it("returns the badge when expiry is absent or still in the future", () => {
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    expect(resolveActiveBadge(sampleBadge, null)).toEqual(sampleBadge);
    expect(resolveActiveBadge(sampleBadge, future)).toEqual(sampleBadge);
  });

  it("returns null when the maintenance window has elapsed", () => {
    const past = new Date(Date.now() - 1_000).toISOString();
    expect(resolveActiveBadge(sampleBadge, past)).toBeNull();
  });
});
