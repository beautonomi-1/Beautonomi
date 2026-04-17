import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PLATFORM_CONFIG } from "@/lib/admin-sections";
import { writeAuditLog } from "@/lib/audit/audit";
import { revalidateTag } from "next/cache";
import { resolveAdminTenantContext } from "@/lib/tenant/scoped-overrides";
import type { MaintenanceScope, MaintenanceScopeConfig } from "@/lib/maintenance-types";
import { MAINTENANCE_SCOPES, getDefaultMaintenance } from "@/lib/maintenance-types";

type SettingsRow = { id: string; settings?: Record<string, unknown> };

async function fetchPlatformSettingsRow(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  tenantId: string | null
): Promise<SettingsRow | null> {
  let q = supabase
    .from("platform_settings")
    .select("id, settings")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1);
  q = tenantId == null ? q.is("tenant_id", null) : q.eq("tenant_id", tenantId);
  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  return (data as SettingsRow | null) ?? null;
}

function buildMaintenanceResponse(
  maintenanceFromDb: Record<string, MaintenanceScopeConfig> | undefined
): Record<MaintenanceScope, MaintenanceScopeConfig> {
  const maintenance = maintenanceFromDb ?? {};
  const defaults = getDefaultMaintenance();
  return {
    public_site: { ...defaults.public_site, ...maintenance.public_site },
    provider_web: { ...defaults.provider_web, ...maintenance.provider_web },
    customer_app: { ...defaults.customer_app, ...maintenance.customer_app },
    provider_app: { ...defaults.provider_app, ...maintenance.provider_app },
  };
}

/**
 * GET /api/admin/maintenance
 * Returns full maintenance config for all scopes (platform config section).
 * Respects admin tenant scope (same row semantics as GET /api/public/maintenance).
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_PLATFORM_CONFIG, request);
    const { currentTenantId, requestedScope } = await resolveAdminTenantContext(
      request,
      undefined,
      user.role ?? null
    );
    const scopeTenantId = requestedScope.scope === "global" ? null : requestedScope.tenantId ?? currentTenantId;

    const supabase = getSupabaseAdmin();

    let row = await fetchPlatformSettingsRow(supabase, scopeTenantId);
    if (!row && scopeTenantId != null) {
      row = await fetchPlatformSettingsRow(supabase, null);
    }

    if (!row) {
      return successResponse(getDefaultMaintenance(), 200);
    }

    const maintenance = (row.settings?.maintenance as Record<string, MaintenanceScopeConfig> | undefined) ?? {};
    return successResponse(buildMaintenanceResponse(maintenance), 200);
  } catch (e) {
    return handleApiError(e, "Failed to load maintenance settings");
  }
}

/**
 * PATCH /api/admin/maintenance
 * Body: { maintenance: Record<MaintenanceScope, MaintenanceScopeConfig>, scope?, tenant_id? }
 * Merges into platform_settings.settings.maintenance for the scoped platform_settings row.
 */
export async function PATCH(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_PLATFORM_CONFIG, request);
    const body = (await request.json()) as {
      maintenance?: Record<string, Partial<MaintenanceScopeConfig>>;
      scope?: string;
      tenant_id?: string;
    };
    const maintenancePayload = body.maintenance;

    if (!maintenancePayload || typeof maintenancePayload !== "object") {
      return errorResponse("Body must include maintenance object", "VALIDATION_ERROR", 400);
    }

    const { currentTenantId, requestedScope } = await resolveAdminTenantContext(
      request,
      body as Record<string, unknown>,
      user.role ?? null
    );
    const scopeTenantId = requestedScope.scope === "global" ? null : requestedScope.tenantId ?? currentTenantId;

    const supabase = getSupabaseAdmin();

    let existingRow = await fetchPlatformSettingsRow(supabase, scopeTenantId);
    let globalFallbackRow: SettingsRow | null = null;
    if (!existingRow && scopeTenantId != null) {
      globalFallbackRow = await fetchPlatformSettingsRow(supabase, null);
    }

    if (!existingRow && scopeTenantId == null) {
      return errorResponse("No platform_settings row found", "NOT_FOUND", 404);
    }

    if (!existingRow && scopeTenantId != null && !globalFallbackRow) {
      return errorResponse(
        "No platform_settings row found (global row required before creating a tenant override)",
        "NOT_FOUND",
        404
      );
    }

    const baseSettings = (existingRow?.settings ?? globalFallbackRow?.settings ?? {}) as Record<string, unknown>;
    const existingMaintenance = (baseSettings.maintenance as Record<string, MaintenanceScopeConfig>) ?? {};
    const defaults = getDefaultMaintenance();

    const nextMaintenance: Record<string, MaintenanceScopeConfig> = {};
    for (const scope of MAINTENANCE_SCOPES) {
      nextMaintenance[scope] = {
        ...defaults[scope],
        ...(existingMaintenance[scope] ?? {}),
      };
    }
    for (const scope of MAINTENANCE_SCOPES) {
      const incoming = maintenancePayload[scope];
      if (incoming && typeof incoming === "object") {
        nextMaintenance[scope] = { ...nextMaintenance[scope], ...incoming } as MaintenanceScopeConfig;
      }
    }

    const nextSettings = { ...baseSettings, maintenance: nextMaintenance };

    type PlatformSettingsRow = { id: string };
    let affectedId: string | null = (existingRow as PlatformSettingsRow | null)?.id ?? null;

    if (existingRow?.id) {
      const { error: updateError } = await supabase
        .from("platform_settings")
        .update({ settings: nextSettings, updated_at: new Date().toISOString() })
        .eq("id", (existingRow as PlatformSettingsRow).id);

      if (updateError) throw updateError;
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from("platform_settings")
        .insert({
          tenant_id: scopeTenantId,
          is_active: true,
          settings: nextSettings,
          updated_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (insertError) throw insertError;
      affectedId = (inserted as PlatformSettingsRow | null)?.id ?? null;
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
      action: "admin.maintenance.update",
      entity_type: "platform_settings",
      entity_id: affectedId,
      metadata: {
        updated_at: new Date().toISOString(),
        scope: requestedScope.scope,
        tenant_id: scopeTenantId,
      },
    });

    revalidateTag("platform-settings", "max");
    return successResponse(buildMaintenanceResponse(nextMaintenance), 200);
  } catch (e) {
    return handleApiError(e, "Failed to save maintenance settings");
  }
}
