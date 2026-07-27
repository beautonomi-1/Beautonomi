import type { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import {
  resolveAgeBand,
  resolveAgeAssurancePolicy,
  readSafetySettingsStored,
  effectiveSafetySettings,
  capabilityBlocked,
  type SocialCapability,
} from "@/lib/age-assurance";

export class SocialAccessDeniedError extends Error {
  status = 403;
  code = "SOCIAL_RESTRICTED";

  constructor(message = "This action is not available with your current safety settings.") {
    super(message);
    this.name = "SocialAccessDeniedError";
  }
}

function logWouldBlock(
  userId: string,
  capability: SocialCapability,
  reason: string,
  band: string,
): void {
  console.info("[safety] social access would block", {
    userId,
    capability,
    reason,
    band,
  });
}

/**
 * Server-side guard for social / UGC write actions.
 * Respects safety.social_age_gate_mode: off → noop, log → audit, enforce → throw.
 */
export async function requireSocialAccess(
  userId: string,
  capability: SocialCapability,
  request: NextRequest,
): Promise<void> {
  const tenantId = await resolveTenantIdWithZaFallback(request);
  const policy = await resolveAgeAssurancePolicy(tenantId);

  if (policy.socialAgeGateMode === "off") return;

  const supabase = await getSupabaseServer(request);
  const { band, source } = await resolveAgeBand(userId, supabase);

  if (band === "under_13") {
    const msg = "You must be at least 13 years old to use this feature.";
    if (policy.socialAgeGateMode === "log") {
      logWouldBlock(userId, capability, "under_13", band);
      return;
    }
    throw Object.assign(new SocialAccessDeniedError(msg), {
      status: 403,
      code: "SOCIAL_RESTRICTED",
    });
  }

  const stored = await readSafetySettingsStored(userId, supabase);
  const effective = await effectiveSafetySettings(band, stored, tenantId);

  if (capabilityBlocked(effective, capability)) {
    const msg = "This action is not available with your current safety settings.";
    if (policy.socialAgeGateMode === "log") {
      logWouldBlock(userId, capability, "safety_settings", band);
      return;
    }
    throw Object.assign(new SocialAccessDeniedError(msg), {
      status: 403,
      code: "SOCIAL_RESTRICTED",
    });
  }

  // Unknown band: allow access but log for observability during rollout
  if (band === "unknown" && policy.socialAgeGateMode === "log") {
    console.info("[safety] unknown age band social access", {
      userId,
      capability,
      source,
    });
  }
}

/** Whether the viewer should see restricted read-side content (feeds, sponsored). */
export async function isRestrictedViewer(
  userId: string | null | undefined,
  request: NextRequest,
): Promise<boolean> {
  if (!userId) return false;

  const tenantId = await resolveTenantIdWithZaFallback(request);
  const supabase = await getSupabaseServer(request);
  const { band } = await resolveAgeBand(userId, supabase);
  const stored = await readSafetySettingsStored(userId, supabase);
  const effective = await effectiveSafetySettings(band, stored, tenantId);

  return (
    band === "under_13" ||
    effective.restricted_mode.value ||
    effective.hide_social_feed.value ||
    effective.sensitive_content_filter.value
  );
}

/** Sensitive explore tags to exclude when sensitive_content_filter is on. */
export const SENSITIVE_EXPLORE_TAGS = [
  "injectables",
  "botox",
  "filler",
  "medical",
  "treatment",
  "laser",
  "peel",
  "microneedling",
  "iv",
  "therapy",
] as const;

export function captionHasSensitiveTerms(caption: string | null | undefined): boolean {
  if (!caption) return false;
  const lower = caption.toLowerCase();
  return SENSITIVE_EXPLORE_TAGS.some((term) => lower.includes(term));
}
