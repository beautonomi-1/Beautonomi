import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  forbiddenResponse,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PLATFORM_CONFIG } from "@/lib/admin-sections";
import { writeAuditLog } from "@/lib/audit/audit";
import { z } from "zod";

async function requireSuperadmin(request: NextRequest) {
  const { user } = await requireAdminSection(ADMIN_SECTION_PLATFORM_CONFIG, request);
  if (user.role !== "superadmin") return { user: null };
  return { user };
}

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  region_code: z.string().length(2).toUpperCase().optional(),
  default_currency: z.string().length(3).toUpperCase().optional(),
  default_language: z.string().min(2).max(10).toLowerCase().optional(),
  default_timezone: z.string().min(1).optional(),
  lifecycle: z.enum(["active", "sandbox", "suspended", "disabled"]).optional(),
  is_active: z.boolean().optional(),
});

/**
 * GET /api/admin/tenants/[id] — fetch a single tenant (superadmin only).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireSuperadmin(request);
    if (!user) return forbiddenResponse("Superadmin only");

    const { id } = await params;
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("tenants")
      .select("id, slug, name, region_code, lifecycle, default_currency, default_language, default_timezone, is_active, created_at, updated_at")
      .eq("id", id)
      .single();

    if (error || !data) {
      return errorResponse("Tenant not found", "NOT_FOUND", 404);
    }
    return successResponse(data);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/admin/tenants/[id] — update tenant details (superadmin only).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireSuperadmin(request);
    if (!user) return forbiddenResponse("Superadmin only");

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0]?.message ?? "Validation error", "VALIDATION_ERROR", 400);
    }

    const patch = parsed.data;
    if (Object.keys(patch).length === 0) {
      return errorResponse("No fields to update", "VALIDATION_ERROR", 400);
    }

    const supabase = getSupabaseAdmin();
    const { data: existing } = await supabase.from("tenants").select("id, slug, name").eq("id", id).single();
    if (!existing) return errorResponse("Tenant not found", "NOT_FOUND", 404);

    const { data: updated, error } = await supabase
      .from("tenants")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id, slug, name, region_code, lifecycle, default_currency, default_language, default_timezone, is_active, updated_at")
      .single();

    if (error) {
      return errorResponse(error.message || "Failed to update tenant", "UPDATE_ERROR", 500);
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
      action: "tenant_update",
      entity_type: "tenants",
      entity_id: id,
      metadata: { patch, slug: existing.slug },
    });

    return successResponse({ tenant: updated });
  } catch (error) {
    return handleApiError(error, "Failed to update tenant");
  }
}

/**
 * DELETE /api/admin/tenants/[id] — soft-deactivate a tenant (superadmin only).
 * Hard-delete is intentionally not supported; use lifecycle: "suspended" for termination.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireSuperadmin(request);
    if (!user) return forbiddenResponse("Superadmin only");

    const { id } = await params;
    const supabase = getSupabaseAdmin();

    const { data: existing } = await supabase.from("tenants").select("id, slug, name, is_active").eq("id", id).single();
    if (!existing) return errorResponse("Tenant not found", "NOT_FOUND", 404);

    const { error } = await supabase
      .from("tenants")
      .update({ is_active: false, lifecycle: "suspended", updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      return errorResponse(error.message || "Failed to deactivate tenant", "UPDATE_ERROR", 500);
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
      action: "tenant_deactivate",
      entity_type: "tenants",
      entity_id: id,
      metadata: { slug: existing.slug, name: existing.name },
    });

    return successResponse({ ok: true, action: "deactivated" });
  } catch (error) {
    return handleApiError(error, "Failed to deactivate tenant");
  }
}
