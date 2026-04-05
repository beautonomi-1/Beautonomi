import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  forbiddenResponse,
  errorResponse,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PLATFORM_CONFIG } from "@/lib/admin-sections";
import { writeAuditLog } from "@/lib/audit/audit";
import { normalizeTenantHostname } from "@/lib/tenant/normalize-tenant-hostname";
import { parseTenantDomainEnvironmentInput } from "@/lib/tenant/tenant-domain-environment";

// @admin-global Superadmin-only: hostname registry spans all tenants.

async function requireSuperadminPlatform(request: NextRequest) {
  const { user } = await requireAdminSection(ADMIN_SECTION_PLATFORM_CONFIG, request);
  if (user.role !== "superadmin") {
    return { user: null };
  }
  return { user };
}

/**
 * PATCH /api/admin/tenant-domains/[id] — update hostname / primary / active (superadmin only).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireSuperadminPlatform(request);
    if (!user) return forbiddenResponse("Superadmin only");

    const { id } = await params;
    if (!id) {
      return errorResponse("Missing id", "VALIDATION_ERROR", 400);
    }

    const body = await request.json().catch(() => ({}));
    const supabase = getSupabaseAdmin();

    const { data: existing, error: fetchErr } = await supabase
      .from("tenant_domains")
      .select("id, tenant_id, hostname, environment, is_legacy, is_primary, is_active")
      .eq("id", id)
      .maybeSingle();

    if (fetchErr || !existing) {
      return notFoundResponse("Domain mapping not found");
    }

    const updates: Record<string, unknown> = {};

    if (body.hostname !== undefined) {
      const norm = normalizeTenantHostname(body.hostname);
      if (norm.ok === false) {
        return errorResponse(norm.error, "VALIDATION_ERROR", 400);
      }
      updates.hostname = norm.hostname;
    }
    if (body.is_active !== undefined) {
      updates.is_active = Boolean(body.is_active);
    }
    if (body.environment !== undefined) {
      const parsed = parseTenantDomainEnvironmentInput(body.environment);
      if (parsed === null) {
        return errorResponse(
          "environment must be production, preview, development, or staging",
          "VALIDATION_ERROR",
          400,
        );
      }
      updates.environment = parsed;
    }
    if (body.is_legacy !== undefined) {
      updates.is_legacy = Boolean(body.is_legacy);
    }

    const wantsPrimary = body.is_primary === true;
    const wantsUnsetPrimary = body.is_primary === false;

    if (wantsPrimary) {
      await supabase.from("tenant_domains").update({ is_primary: false }).eq("tenant_id", existing.tenant_id);
      updates.is_primary = true;
    } else if (wantsUnsetPrimary) {
      updates.is_primary = false;
    }

    if (Object.keys(updates).length === 0) {
      return errorResponse("No valid fields to update", "VALIDATION_ERROR", 400);
    }

    const { data: row, error: updErr } = await supabase
      .from("tenant_domains")
      .update(updates)
      .eq("id", id)
      .select("id, tenant_id, hostname, environment, is_legacy, is_primary, is_active, created_at")
      .single();

    if (updErr) {
      if (updErr.code === "23505") {
        return errorResponse(
          "That hostname and environment combination is already mapped",
          "DUPLICATE_HOSTNAME",
          409,
        );
      }
      return errorResponse(updErr.message || "Update failed", "UPDATE_ERROR", 500);
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
      action: "tenant_domain_update",
      entity_type: "tenant_domains",
      entity_id: id,
      metadata: { before: existing, after: updates },
    });

    return successResponse({ domain: row });
  } catch (error) {
    return handleApiError(error, "Failed to update tenant domain");
  }
}

/**
 * DELETE /api/admin/tenant-domains/[id] — remove mapping (superadmin only).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireSuperadminPlatform(request);
    if (!user) return forbiddenResponse("Superadmin only");

    const { id } = await params;
    if (!id) {
      return errorResponse("Missing id", "VALIDATION_ERROR", 400);
    }

    const supabase = getSupabaseAdmin();

    const { data: existing, error: fetchErr } = await supabase
      .from("tenant_domains")
      .select("id, tenant_id, hostname")
      .eq("id", id)
      .maybeSingle();

    if (fetchErr || !existing) {
      return notFoundResponse("Domain mapping not found");
    }

    const { error: delErr } = await supabase.from("tenant_domains").delete().eq("id", id);
    if (delErr) {
      return errorResponse(delErr.message || "Delete failed", "DELETE_ERROR", 500);
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
      action: "tenant_domain_delete",
      entity_type: "tenant_domains",
      entity_id: id,
      metadata: { hostname: existing.hostname, tenant_id: existing.tenant_id },
    });

    return successResponse({ ok: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete tenant domain");
  }
}
