import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { successResponse, notFoundResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { writeAuditLog } from "@/lib/audit/audit";

const ALLOWED_UPDATE_FIELDS = [
  "name",
  "email",
  "phone",
  "role",
  "is_active",
  "commission_percentage",
  "bio",
] as const;

/**
 * GET /api/admin/staff/[id]
 * Get a single staff member with provider info (superadmin only).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) return unauthorizedResponse("Authentication required");

    const supabase = getSupabaseAdmin();
    const { id } = await params;

    const { data: staff, error } = await supabase
      .from("provider_staff")
      .select("id, provider_id, user_id, name, email, phone, role, avatar_url, bio, is_active, commission_percentage, created_at, updated_at, provider:providers(id, business_name, slug)")
      .eq("id", id)
      .single();

    if (error || !staff) return notFoundResponse("Staff member not found");
    return successResponse(staff);
  } catch (error) {
    return handleApiError(error, "Failed to fetch staff");
  }
}

/**
 * PATCH /api/admin/staff/[id]
 * Update staff member (superadmin only; only allowed fields).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) return unauthorizedResponse("Authentication required");

    const supabase = getSupabaseAdmin();
    const body = await request.json();
    const { id } = await params;

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const key of ALLOWED_UPDATE_FIELDS) {
      if (body[key] !== undefined) updateData[key] = body[key];
    }

    const { error } = await supabase
      .from("provider_staff")
      .update(updateData)
      .eq("id", id);

    if (error) throw error;

    await writeAuditLog({
      actor_user_id: auth.user.id,
      actor_role: (auth.user as any).role || "superadmin",
      action: "admin.staff.update",
      entity_type: "provider_staff",
      entity_id: id,
      metadata: updateData,
    });

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to update staff");
  }
}

/**
 * DELETE /api/admin/staff/[id]
 * Delete staff member (superadmin only; uses admin client to bypass RLS).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = getSupabaseAdmin();
    const { id } = await params;

    const { error } = await supabase
      .from("provider_staff")
      .delete()
      .eq("id", id);

    if (error) throw error;

    await writeAuditLog({
      actor_user_id: auth.user.id,
      actor_role: (auth.user as any).role || "superadmin",
      action: "admin.staff.delete",
      entity_type: "provider_staff",
      entity_id: id,
      metadata: {},
    });

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete staff");
  }
}
