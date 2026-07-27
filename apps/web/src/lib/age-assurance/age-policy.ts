import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { FEATURE_FLAG_KEYS } from "@/lib/server/feature-flag-keys";
import type { SocialAgeGateMode } from "./types";

export interface AgeAssurancePolicy {
  socialMinAge: number;
  socialAgeGateMode: SocialAgeGateMode;
  restrictedModeDefaults: Record<string, boolean>;
}

const DEFAULT_POLICY: AgeAssurancePolicy = {
  socialMinAge: 13,
  socialAgeGateMode: "log",
  restrictedModeDefaults: {
    restricted_mode: true,
    hide_social_feed: true,
    disable_comments_likes: true,
    disable_direct_messaging: false,
    sensitive_content_filter: true,
    require_device_auth: true,
  },
};

function parseGateMode(raw: unknown): SocialAgeGateMode {
  if (raw === "off" || raw === "log" || raw === "enforce") return raw;
  return DEFAULT_POLICY.socialAgeGateMode;
}

function parseMinAge(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return raw;
  if (typeof raw === "string") {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return DEFAULT_POLICY.socialMinAge;
}

function parseDefaults(raw: unknown): Record<string, boolean> {
  if (!raw || typeof raw !== "object") return DEFAULT_POLICY.restrictedModeDefaults;
  const obj = raw as Record<string, unknown>;
  const out: Record<string, boolean> = { ...DEFAULT_POLICY.restrictedModeDefaults };
  for (const key of Object.keys(DEFAULT_POLICY.restrictedModeDefaults)) {
    if (typeof obj[key] === "boolean") out[key] = obj[key];
  }
  return out;
}

/**
 * Read safety feature-flag metadata directly from DB (not checkMultipleFeaturesServer,
 * which only returns enabled booleans).
 */
export async function resolveAgeAssurancePolicy(
  tenantId?: string | null,
): Promise<AgeAssurancePolicy> {
  try {
    const supabase = getSupabaseAdmin();
    const keys = [
      FEATURE_FLAG_KEYS.SAFETY_SOCIAL_MIN_AGE,
      FEATURE_FLAG_KEYS.SAFETY_SOCIAL_AGE_GATE_MODE,
      FEATURE_FLAG_KEYS.SAFETY_RESTRICTED_MODE_DEFAULTS,
    ];

    const { data: rows, error } = await supabase
      .from("feature_flags")
      .select("feature_key, metadata, tenant_id")
      .in("feature_key", keys)
      .or(
        tenantId
          ? `tenant_id.is.null,tenant_id.eq.${tenantId}`
          : "tenant_id.is.null",
      );

    if (error) throw error;

    const byKey = new Map<string, Record<string, unknown>>();
    for (const row of rows ?? []) {
      const key = row.feature_key as string;
      const existing = byKey.get(key);
      // Tenant row overrides global
      if (!existing || row.tenant_id != null) {
        byKey.set(key, (row.metadata as Record<string, unknown>) ?? {});
      }
    }

    const minAgeMeta = byKey.get(FEATURE_FLAG_KEYS.SAFETY_SOCIAL_MIN_AGE) ?? {};
    const modeMeta = byKey.get(FEATURE_FLAG_KEYS.SAFETY_SOCIAL_AGE_GATE_MODE) ?? {};
    const defaultsMeta = byKey.get(FEATURE_FLAG_KEYS.SAFETY_RESTRICTED_MODE_DEFAULTS) ?? {};

    return {
      socialMinAge: parseMinAge(minAgeMeta.min_age),
      socialAgeGateMode: parseGateMode(modeMeta.mode),
      restrictedModeDefaults: parseDefaults(defaultsMeta),
    };
  } catch (err) {
    console.warn("[age-assurance] resolveAgeAssurancePolicy fallback:", err);
    return DEFAULT_POLICY;
  }
}
