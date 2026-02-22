import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { writeAuditLog } from "@/lib/audit/audit";

/**
 * GET /api/admin/staff
 *
 * ADMIN STAFF vs PROVIDER STAFF (Cross-Portal boundary):
 * - Admin staff: platform-level view of ALL provider_staff across providers.
 *   Use case: superadmin support, provider onboarding oversight, cross-provider analytics.
 * - Provider staff: /api/provider/staff returns only staff for the current provider (via getProviderIdForUser).
 *   Use case: provider manages their own team, invite, permissions.
 * - Both query provider_staff table; admin has no separate "platform staff" table.
 * - Permission: admin requires superadmin; provider requires provider_owner/provider_staff.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer();
    const { searchParams } = new URL(request.url);
    const providerId = searchParams.get("provider_id");
    const role = searchParams.get("role");
    const isActive = searchParams.get("is_active");

    let query = supabase
      .from("provider_staff")
      .select(`
        id,
        provider_id,
        user_id,
        name,
        email,
        phone,
        role,
        avatar_url,
        bio,
        is_active,
        commission_percentage,
        created_at,
        updated_at,
        provider:providers(id, business_name, slug)
      `)
      .order("created_at", { ascending: false });

    if (providerId) {
      query = query.eq("provider_id", providerId);
    }

    if (role) {
      query = query.eq("role", role);
    }

    if (isActive !== null) {
      query = query.eq("is_active", isActive === "true");
    }

    const { data: staff, error } = await query;

    if (error) throw error;

    // Get statistics
    const { data: allStaff } = await supabase
      .from("provider_staff")
      .select("id, role, is_active");

    const stats = {
      total: allStaff?.length || 0,
      active: allStaff?.filter((s) => s.is_active).length || 0,
      inactive: allStaff?.filter((s) => !s.is_active).length || 0,
      by_role: {
        owner: allStaff?.filter((s) => s.role === "owner").length || 0,
        manager: allStaff?.filter((s) => s.role === "manager").length || 0,
        employee: allStaff?.filter((s) => s.role === "employee").length || 0,
      },
    };

    return successResponse({
      staff: staff || [],
      statistics: stats,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch staff");
  }
}

/**
 * PATCH /api/admin/staff/[id]
 * 
 * Update staff member
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer();
    const body = await request.json();
    const { id } = params;

    const { error } = await supabase
      .from("provider_staff")
      .update(body)
      .eq("id", id);

    if (error) throw error;

    await writeAuditLog({
      actor_user_id: auth.user.id,
      actor_role: (auth.user as any).role || "superadmin",
      action: "admin.staff.update",
      entity_type: "provider_staff",
      entity_id: id,
      metadata: body,
    });

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to update staff");
  }
}

/**
 * DELETE /api/admin/staff/[id]
 * 
 * Delete staff member
 */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer();
    const { id } = params;

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
