import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveFlagsForUser } from "@/lib/config";
import type { Platform, Environment } from "@/lib/config/types";

const PLATFORMS: Platform[] = ["web", "customer", "provider"];
const ENVS: Environment[] = ["production", "staging", "development"];

/**
 * POST /api/admin/control-plane/flags-preview
 * Body: { user_id?, role?, platform?, environment?, app_version? }
 * Returns resolved flags for the given context (superadmin only).
 */
export async function POST(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const body = await request.json().catch(() => ({}));
    const userId = body.user_id ?? null;
    const role = body.role ?? null;
    const platform = PLATFORMS.includes(body.platform) ? body.platform : "web";
    const environment = ENVS.includes(body.environment) ? body.environment : "production";
    const appVersion = body.app_version ?? null;

    const supabase = getSupabaseAdmin();
    const { data: rawFlags } = await supabase
      .from("feature_flags")
      .select("feature_key, enabled, rollout_percent, platforms_allowed, roles_allowed, min_app_version, environments_allowed");

    const flags = (rawFlags ?? []) as Array<{
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
      context: { userId, role, platform, environment, app_version: appVersion },
      resolved,
    });
  } catch (error) {
    return handleApiError(error as Error, "Failed to preview flags");
  }
}
