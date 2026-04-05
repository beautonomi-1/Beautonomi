import { NextRequest } from "next/server";
import { requireAdminSection, successResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PLATFORM_CONFIG } from "@/lib/admin-sections";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveFlagsForUser } from "@/lib/config";
import { mergeGlobalAndTenantFeatureFlags } from "@/lib/config/merge-feature-flags";
import type { Platform, Environment } from "@/lib/config/types";

const PLATFORMS: Platform[] = ["web", "customer", "provider"];
const ENVS: Environment[] = ["production", "staging", "development"];

// @admin-global Resolves merged flags for arbitrary preview context; reads entire feature_flags table to merge global + tenant.

/**
 * POST /api/admin/control-plane/flags-preview
 * Body: { user_id?, role?, platform?, environment?, app_version?, tenant_id? }
 * Returns resolved flags for the given context (superadmin only).
 */
export async function POST(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_PLATFORM_CONFIG, request);
    const body = await request.json().catch(() => ({}));
    const userId = body.user_id ?? null;
    const role = body.role ?? null;
    const platform = PLATFORMS.includes(body.platform) ? body.platform : "web";
    const environment = ENVS.includes(body.environment) ? body.environment : "production";
    const appVersion = body.app_version ?? null;
    const tenantId =
      typeof body.tenant_id === "string" && /^[0-9a-f-]{36}$/i.test(body.tenant_id)
        ? body.tenant_id
        : null;

    const supabase = getSupabaseAdmin();
    const { data: globalRows } = await supabase
      .from("feature_flags")
      .select("feature_key, enabled, rollout_percent, platforms_allowed, roles_allowed, min_app_version, environments_allowed")
      .is("tenant_id", null);

    let merged = (globalRows ?? []) as Array<{
      feature_key: string;
      enabled: boolean;
      rollout_percent?: number | null;
      platforms_allowed?: string[] | null;
      roles_allowed?: string[] | null;
      min_app_version?: string | null;
      environments_allowed?: string[] | null;
    }>;

    if (tenantId) {
      const { data: tenantRows } = await supabase
        .from("feature_flags")
        .select("feature_key, enabled, rollout_percent, platforms_allowed, roles_allowed, min_app_version, environments_allowed")
        .eq("tenant_id", tenantId);
      if (tenantRows?.length) {
        merged = mergeGlobalAndTenantFeatureFlags(merged, tenantRows as typeof merged);
      }
    }

    const flags = merged as Array<{
      feature_key: string;
      enabled: boolean;
      rollout_percent?: number | null;
      platforms_allowed?: string[] | null;
      roles_allowed?: string[] | null;
      min_app_version?: string | null;
      environments_allowed?: string[] | null;
    }>;

    const resolved = resolveFlagsForUser({
      flags,
      userId,
      role,
      platform,
      appVersion,
      environment,
    });

    return successResponse({
      context: { userId, role, platform, environment, app_version: appVersion, tenant_id: tenantId },
      resolved,
    });
  } catch (error) {
    return handleApiError(error as Error, "Failed to preview flags");
  }
}
