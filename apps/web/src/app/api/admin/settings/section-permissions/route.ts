import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  getEffectiveAdminSectionRoles,
  successResponse,
  handleApiError,
  errorResponse,
  requireRoleInApi,
} from "@/lib/supabase/api-helpers";
import { ALL_SECTIONS, ALL_ADMIN_ROLES } from "@/lib/admin-sections";
import type { AdminSection } from "@/lib/admin-sections";
import type { UserRole } from "@/types/beautonomi";
import { writeAuditLog } from "@/lib/audit/audit";
import { resolveAdminTenantContext } from "@/lib/tenant/scoped-overrides";

/**
 * GET /api/admin/settings/section-permissions
 * Returns effective section -> roles (DB overrides merged with defaults).
 * Any admin can read (for sidebar filtering); only superadmin can PUT.
 */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(ALL_ADMIN_ROLES, request);
    const sectionRoles = await getEffectiveAdminSectionRoles();
    return successResponse({ sectionRoles });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PUT /api/admin/settings/section-permissions
 * Updates platform_settings.settings.admin_section_roles. Superadmin only.
 * Body: { sectionRoles: Record<AdminSection, UserRole[]> }
 */
export async function PUT(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["superadmin"], request);
    const body = await request.json();
    const { currentTenantId, requestedScope } = await resolveAdminTenantContext(
      request,
      body as Record<string, unknown>,
      (user as { role?: string }).role ?? null
    );
    const scopeTenantId = requestedScope.scope === "global" ? null : requestedScope.tenantId ?? currentTenantId;
    const raw = body.sectionRoles as Record<string, string[] | undefined> | undefined;

    if (!raw || typeof raw !== "object") {
      return errorResponse("sectionRoles object required", "VALIDATION_ERROR", 400);
    }

    const allowedRolesSet = new Set(ALL_ADMIN_ROLES);
    const sectionRoles: Record<string, UserRole[]> = {};

    for (const section of ALL_SECTIONS) {
      const val = raw[section];
      if (val === undefined) continue;
      if (!Array.isArray(val)) {
        return errorResponse(`sectionRoles.${section} must be an array`, "VALIDATION_ERROR", 400);
      }
      sectionRoles[section] = val.filter((r) => typeof r === "string" && allowedRolesSet.has(r as UserRole)) as UserRole[];
    }

    const supabase = await getSupabaseServer(request);
    let rowQuery = supabase
      .from("platform_settings")
      .select("id, settings")
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1);
    rowQuery = scopeTenantId == null ? rowQuery.is("tenant_id", null) : rowQuery.eq("tenant_id", scopeTenantId);
    const { data: row, error: fetchError } = await rowQuery.maybeSingle();

    if (fetchError) throw fetchError;

    let rowId: string;
    let currentSettings: Record<string, unknown>;

    if (row) {
      rowId = (row as { id: string }).id;
      currentSettings = ((row as { settings?: Record<string, unknown> }).settings ?? {}) as Record<string, unknown>;
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from("platform_settings")
        .insert({ settings: {}, is_active: true, tenant_id: scopeTenantId })
        .select("id")
        .single();
      if (insertError || !inserted) throw insertError ?? new Error("Failed to create platform settings row");
      rowId = (inserted as { id: string }).id;
      currentSettings = {};
    }

    const existing = (currentSettings.admin_section_roles as Record<string, UserRole[]> | undefined) ?? {};
    const merged: Record<string, UserRole[]> = {};
    for (const section of ALL_SECTIONS) {
      merged[section] = sectionRoles[section] ?? existing[section] ?? [];
    }

    const updatedSettings = {
      ...currentSettings,
      admin_section_roles: merged as Partial<Record<AdminSection, UserRole[]>>,
    };

    const { error: updateError } = await supabase
      .from("platform_settings")
      .update({
        settings: updatedSettings,
        updated_at: new Date().toISOString(),
      })
      .eq("id", rowId);

    if (updateError) throw updateError;

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: (user as { role?: string }).role ?? null,
      action: "section_permissions_updated",
      entity_type: "platform_settings",
      metadata: { scope: requestedScope.scope, tenant_id: scopeTenantId },
    });

    return successResponse({ message: "Section permissions updated" });
  } catch (error) {
    return handleApiError(error);
  }
}
