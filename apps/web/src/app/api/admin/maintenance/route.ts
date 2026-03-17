import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, handleApiError, errorResponse  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PLATFORM_CONFIG } from "@/lib/admin-sections";
import { writeAuditLog } from "@/lib/audit/audit";
import { revalidateTag } from "next/cache";
import type { MaintenanceScope, MaintenanceScopeConfig } from "@/lib/maintenance-types";
import { MAINTENANCE_SCOPES, getDefaultMaintenance } from "@/lib/maintenance-types";

/**
 * GET /api/admin/maintenance
 * Returns full maintenance config for all scopes (superadmin only).
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_PLATFORM_CONFIG, request);
    const supabase = getSupabaseAdmin();

    const { data: row, error } = await supabase
      .from("platform_settings")
      .select("id, settings")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    const settings = (row as { id: string; settings?: Record<string, unknown> } | null)?.settings;
    const maintenance = (settings?.maintenance as Record<string, MaintenanceScopeConfig> | undefined) ?? {};
    const defaults = getDefaultMaintenance();

    const data: Record<MaintenanceScope, MaintenanceScopeConfig> = {
      public_site: { ...defaults.public_site, ...maintenance.public_site },
      provider_web: { ...defaults.provider_web, ...maintenance.provider_web },
      customer_app: { ...defaults.customer_app, ...maintenance.customer_app },
      provider_app: { ...defaults.provider_app, ...maintenance.provider_app },
    };

    return successResponse(data, 200);
  } catch (e) {
    return handleApiError(e, "Failed to load maintenance settings");
  }
}

/**
 * PATCH /api/admin/maintenance
 * Body: { maintenance: Record<MaintenanceScope, MaintenanceScopeConfig> }
 * Merges into platform_settings.settings.maintenance (superadmin only).
 */
export async function PATCH(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_PLATFORM_CONFIG, request);
    const body = (await request.json()) as { maintenance?: Record<string, Partial<MaintenanceScopeConfig>> };
    const maintenancePayload = body.maintenance;

    if (!maintenancePayload || typeof maintenancePayload !== "object") {
      return errorResponse("Body must include maintenance object", "VALIDATION_ERROR", 400);
    }

    const supabase = getSupabaseAdmin();
    const { data: existingRow, error: fetchError } = await supabase
      .from("platform_settings")
      .select("id, settings")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!existingRow) throw new Error("No platform_settings row found");

    const existingSettings = (existingRow as { id: string; settings: Record<string, unknown> }).settings ?? {};
    const existingMaintenance = (existingSettings.maintenance as Record<string, MaintenanceScopeConfig>) ?? {};
    const defaults = getDefaultMaintenance();

    const nextMaintenance: Record<string, MaintenanceScopeConfig> = { ...existingMaintenance };
    for (const scope of MAINTENANCE_SCOPES) {
      const incoming = maintenancePayload[scope];
      if (incoming && typeof incoming === "object") {
        nextMaintenance[scope] = { ...defaults[scope], ...existingMaintenance[scope], ...incoming } as MaintenanceScopeConfig;
      }
    }

    const nextSettings = { ...existingSettings, maintenance: nextMaintenance };

    type PlatformSettingsRow = { id: string };
    const { error: updateError } = await supabase
      .from("platform_settings")
      .update({ settings: nextSettings, updated_at: new Date().toISOString() })
      .eq("id", (existingRow as PlatformSettingsRow).id);

    if (updateError) throw updateError;

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
      action: "admin.maintenance.update",
      entity_type: "platform_settings",
      entity_id: (existingRow as PlatformSettingsRow).id,
      metadata: { updated_at: new Date().toISOString() },
    });

    revalidateTag("platform-settings", "max");
    return successResponse(nextMaintenance, 200);
  } catch (e) {
    return handleApiError(e, "Failed to save maintenance settings");
  }
}
