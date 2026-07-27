import { describe, expect, it } from "vitest";
import {
  ALL_FEATURE_CATEGORY_KEYS,
  FEATURE_REGISTRY,
  getFreePlanFeatures,
  getFreePlanScalarLimits,
  normalizeFeatures,
  resolveNewGateFeatureEnabled,
} from "../index";
import { planFeaturesSchema } from "../zod";

describe("subscription-features registry", () => {
  it("covers all category keys", () => {
    expect(FEATURE_REGISTRY.map((c) => c.key).sort()).toEqual([...ALL_FEATURE_CATEGORY_KEYS].sort());
  });

  it("free plan enables every product feature category", () => {
    const features = getFreePlanFeatures();
    // Intentionally off on free: booking caps only.
    const freePlanDisabled = new Set(["booking_limits"]);
    for (const key of ALL_FEATURE_CATEGORY_KEYS) {
      if (freePlanDisabled.has(key)) continue;
      const cat = features[key];
      expect(cat?.enabled, key).toBe(true);
    }
    expect(features.booking_limits?.enabled).toBe(false);
    expect(features.terminal_bundle?.enabled).toBe(true);
    expect(features.paycloud_integration?.enabled).toBe(true);
  });

  it("normalizeFeatures merges partial DB rows", () => {
    const normalized = normalizeFeatures({
      marketing_campaigns: { enabled: false },
    });
    expect(normalized.marketing_campaigns?.enabled).toBe(false);
    expect(normalized.online_booking?.enabled).toBe(true);
  });

  it("planFeaturesSchema accepts free plan shape", () => {
    const parsed = planFeaturesSchema.safeParse(getFreePlanFeatures());
    expect(parsed.success).toBe(true);
  });

  it("resolveNewGateFeatureEnabled is fail-open when key missing", () => {
    expect(resolveNewGateFeatureEnabled({}, "gift_cards")).toBe(true);
    expect(resolveNewGateFeatureEnabled({ gift_cards: { enabled: false } }, "gift_cards")).toBe(false);
  });

  it("scalar limits are generous for free tier", () => {
    const limits = getFreePlanScalarLimits();
    expect(limits.max_staff_members).toBe(25);
    expect(limits.max_locations).toBe(10);
    expect(limits.max_bookings_per_month).toBeNull();
  });
});
