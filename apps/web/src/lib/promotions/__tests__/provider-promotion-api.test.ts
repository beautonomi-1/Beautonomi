import { describe, it, expect } from "vitest";
import {
  parseOptionalLimit,
  parseOptionalAmount,
  resolveValidWindowFromBody,
} from "../provider-promotion-api";

describe("resolveValidWindowFromBody", () => {
  const tz = "Africa/Johannesburg";

  it("no_end_date stores open-ended window from start_date", () => {
    const r = resolveValidWindowFromBody(
      { no_end_date: true, start_date: "2026-07-01" },
      tz,
    );
    expect("error" in r).toBe(false);
    if ("error" in r) return;
    expect(r.validUntil).toBeNull();
    expect(r.validFrom).toBeInstanceOf(Date);
  });

  it("rejects end date before start date", () => {
    const r = resolveValidWindowFromBody(
      { start_date: "2026-07-10", end_date: "2026-07-09" },
      tz,
    );
    expect(r).toEqual({ error: "End date must be after start date" });
  });

  it("allows same calendar day (start midnight through end of day)", () => {
    const r = resolveValidWindowFromBody(
      { start_date: "2026-07-10", end_date: "2026-07-10" },
      tz,
    );
    expect("error" in r).toBe(false);
    if ("error" in r) return;
    expect(r.validUntil!.getTime()).toBeGreaterThan(r.validFrom.getTime());
  });

  it("POST without end uses ~365 day fallback", () => {
    const before = Date.now();
    const r = resolveValidWindowFromBody({}, tz);
    expect("error" in r).toBe(false);
    if ("error" in r) return;
    expect(r.validUntil).not.toBeNull();
    const yearMs = 365 * 24 * 60 * 60 * 1000;
    expect(r.validUntil!.getTime() - r.validFrom.getTime()).toBeGreaterThan(yearMs - 86400000);
    expect(r.validFrom.getTime()).toBeGreaterThanOrEqual(before - 5000);
  });

  it("PATCH without dates returns skip sentinel", () => {
    const r = resolveValidWindowFromBody({}, tz, { forPatch: true });
    expect(r).toEqual({ error: "PATCH_SKIP_DATES" });
  });
});

describe("parseOptionalLimit", () => {
  it("returns null for empty", () => {
    expect(parseOptionalLimit("")).toBeNull();
    expect(parseOptionalLimit(null)).toBeNull();
  });

  it("rejects below 1", () => {
    expect(parseOptionalLimit(0)).toBeNull();
  });

  it("accepts positive integers", () => {
    expect(parseOptionalLimit(5)).toBe(5);
  });
});

describe("parseOptionalAmount", () => {
  it("returns null for empty or non-positive", () => {
    expect(parseOptionalAmount("")).toBeNull();
    expect(parseOptionalAmount(0)).toBeNull();
  });

  it("parses positive amounts", () => {
    expect(parseOptionalAmount("50.5")).toBe(50.5);
  });
});
