import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  successResponse,
  errorResponse,
  handleApiError,
  requireRoleInApi,
} from "@/lib/supabase/api-helpers";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import {
  resolveAgeBand,
  readSafetySettingsStored,
  writeSafetySettingsStored,
  effectiveSafetySettings,
  type SafetySettingsStored,
} from "@/lib/age-assurance";

const PATCHABLE_KEYS = [
  "restricted_mode",
  "hide_social_feed",
  "disable_comments_likes",
  "disable_direct_messaging",
  "sensitive_content_filter",
  "require_device_auth",
] as const;

type PatchableKey = (typeof PATCHABLE_KEYS)[number];

function isPatchableKey(key: string): key is PatchableKey {
  return (PATCHABLE_KEYS as readonly string[]).includes(key);
}

function serializeEffective(
  effective: Awaited<ReturnType<typeof effectiveSafetySettings>>,
) {
  const flat: Record<string, boolean> = {};
  const locked: Record<string, boolean> = {};
  for (const key of PATCHABLE_KEYS) {
    flat[key] = effective[key].value;
    locked[key] = effective[key].locked;
  }
  return { settings: flat, locked };
}

/**
 * GET /api/me/safety-settings
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request,
    );
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveTenantIdWithZaFallback(request);

    const [age, stored] = await Promise.all([
      resolveAgeBand(user.id, supabase),
      readSafetySettingsStored(user.id, supabase),
    ]);
    const effective = await effectiveSafetySettings(age.band, stored, tenantId);
    const { settings, locked } = serializeEffective(effective);

    return successResponse({
      ...settings,
      locked,
      age_band: age.band,
      age_source: age.source,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch safety settings");
  }
}

/**
 * PATCH /api/me/safety-settings
 */
export async function PATCH(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request,
    );
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const body = (await request.json()) as Record<string, unknown>;

    const age = await resolveAgeBand(user.id, supabase);
    const stored = await readSafetySettingsStored(user.id, supabase);
    const effectiveBefore = await effectiveSafetySettings(age.band, stored, tenantId);

    const patch: SafetySettingsStored = {};
    for (const key of PATCHABLE_KEYS) {
      if (body[key] !== undefined) {
        if (typeof body[key] !== "boolean") {
          return errorResponse(
            `${key} must be a boolean`,
            "VALIDATION_ERROR",
            400,
          );
        }
        if (effectiveBefore[key].locked && body[key] !== effectiveBefore[key].value) {
          return errorResponse(
            "This safety setting is locked for your age group and cannot be changed.",
            "SAFETY_SETTING_LOCKED",
            403,
          );
        }
        patch[key] = body[key];
      }
    }

    if (Object.keys(patch).length === 0) {
      return errorResponse("No valid fields to update", "VALIDATION_ERROR", 400);
    }

    const updatedStored = await writeSafetySettingsStored(user.id, supabase, patch);
    const effectiveAfter = await effectiveSafetySettings(age.band, updatedStored, tenantId);
    const { settings, locked } = serializeEffective(effectiveAfter);

    return successResponse({
      ...settings,
      locked,
      age_band: age.band,
      age_source: age.source,
    });
  } catch (error) {
    return handleApiError(error, "Failed to update safety settings");
  }
}
