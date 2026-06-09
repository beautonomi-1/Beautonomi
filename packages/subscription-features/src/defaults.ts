import { FEATURE_REGISTRY } from "./registry";
import type { PlanFeaturesMap, PlanScalarLimits } from "./types";

function buildFeaturesFromRegistry(mode: "free" | "generous"): PlanFeaturesMap {
  const out: PlanFeaturesMap = {};
  for (const category of FEATURE_REGISTRY) {
    const blob: Record<string, unknown> = {};
    for (const field of category.fields) {
      const value =
        mode === "generous" && field.generousDefault !== undefined
          ? field.generousDefault
          : field.freePlanDefault;
      blob[field.key] = value;
    }
    out[category.key] = blob;
  }
  return out;
}

/** Generous defaults for the free tier — every feature ON with high limits. */
export function getFreePlanFeatures(): PlanFeaturesMap {
  return buildFeaturesFromRegistry("free");
}

/** Alias used by migrations / backfills. */
export function getGenerousDefaults(): PlanFeaturesMap {
  return getFreePlanFeatures();
}

/** Scalar columns on subscription_plans aligned with generous free tier. */
export function getFreePlanScalarLimits(): PlanScalarLimits {
  return {
    max_bookings_per_month: null,
    max_staff_members: 25,
    max_locations: 10,
  };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Merge raw DB features with registry defaults so admin UI always has a full shape.
 */
export function normalizeFeatures(raw: unknown): PlanFeaturesMap {
  const defaults = getFreePlanFeatures();
  if (!isPlainObject(raw)) return { ...defaults };
  if (Array.isArray(raw)) return { ...defaults };

  const merged: PlanFeaturesMap = { ...defaults };
  for (const category of FEATURE_REGISTRY) {
    const rawCat = raw[category.key];
    const base = { ...defaults[category.key] };
    if (isPlainObject(rawCat)) {
      merged[category.key] = { ...base, ...rawCat };
    } else {
      merged[category.key] = base;
    }
  }
  return merged;
}

/** Keys introduced for new subscription gates (fail-open when absent on legacy plans). */
export const NEW_GATE_FEATURE_KEYS = [
  "gift_cards",
  "packages",
  "pos_walk_in",
  "custom_requests",
  "platform_ads",
  "online_booking",
] as const;

export type NewGateFeatureKey = (typeof NEW_GATE_FEATURE_KEYS)[number];

/**
 * Fail-open for new gates: missing key → allowed. Present key → respect `enabled`.
 */
export function resolveNewGateFeatureEnabled(
  features: Record<string, unknown> | null | undefined,
  key: NewGateFeatureKey,
): boolean {
  if (!features || typeof features !== "object") return true;
  const node = features[key];
  if (node === undefined || node === null) return true;
  if (typeof node === "boolean") return node;
  if (typeof node === "object" && node !== null) {
    const o = node as { enabled?: boolean };
    if (o.enabled === undefined) return true;
    return o.enabled === true;
  }
  return true;
}
