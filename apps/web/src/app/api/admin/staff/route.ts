import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDERS_OPERATIONS } from "@/lib/admin-sections";

/**
 * GET /api/admin/staff
 *
 * ADMIN STAFF vs PROVIDER STAFF (Cross-Portal boundary):
 * - Admin staff: platform-level view of ALL provider_staff across providers.
 *   Use case: superadmin support, provider onboarding oversight, cross-provider analytics.
 * - Provider staff: /api/provider/staff returns only staff for the current provider (via getProviderIdForUser).
 *   Use case: provider manages their own team, invite, permissions.
 * - Both query provider_staff table; admin has no separate "platform staff" table.
 * - Permission: admin endpoints are section-gated via ADMIN_SECTION_PROVIDERS_OPERATIONS.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_PROVIDERS_OPERATIONS, request);

    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(request.url);
    const providerId = searchParams.get("provider_id");
    const role = searchParams.get("role"); // staff role: owner | manager | employee
    const userRole = searchParams.get("user_role"); // account role: provider_owner | provider_staff
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
        provider:providers(id, business_name, slug),
        users(role)
      `)
      .order("created_at", { ascending: false });

    if (providerId) {
      query = query.eq("provider_id", providerId);
    }

    if (role) {
      query = query.eq("role", role);
    }

    if (isActive !== null && isActive !== undefined && isActive !== "") {
      query = query.eq("is_active", isActive === "true");
    }

    const { data: staffRows, error } = await query;

    if (error) throw error;

    type StaffRow = { users?: { role?: string } | { role?: string }[] | null; [key: string]: unknown };
    type StaffWithRole = StaffRow & { user_role: string | null };
    let staff = (staffRows || []).map((s: unknown) => {
      const row = s as StaffRow;
      const _u = Array.isArray(row.users) ? row.users[0] : row.users;
      const { users: _unused, ...rest } = row;
      return { ...rest, user_role: _u?.role ?? null } as StaffWithRole;
    });
    if (userRole) {
      staff = staff.filter((s) => s.user_role === userRole);
    }

    const { data: allStaffWithUser } = await supabase
      .from("provider_staff")
      .select("id, role, is_active, users(role)");

    const allStaff = (allStaffWithUser || []) as StaffRow[];
    const stats = {
      total: allStaff.length,
      active: allStaff.filter((s) => s.is_active).length,
      inactive: allStaff.filter((s) => !s.is_active).length,
      by_staff_role: {
        owner: allStaff.filter((s) => s.role === "owner").length,
        manager: allStaff.filter((s) => s.role === "manager").length,
        employee: allStaff.filter((s) => s.role === "employee").length,
      },
      by_user_role: {
        provider_owner: allStaff.filter((s) => (Array.isArray(s.users) ? s.users[0] : s.users)?.role === "provider_owner").length,
        provider_staff: allStaff.filter((s) => (Array.isArray(s.users) ? s.users[0] : s.users)?.role === "provider_staff").length,
        no_account: allStaff.filter((s) => !(Array.isArray(s.users) ? s.users[0] : s.users)?.role).length,
      },
    };

    return successResponse({
      staff,
      statistics: stats,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch staff");
  }
}
