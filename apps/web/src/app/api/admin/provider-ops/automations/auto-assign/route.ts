import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDER_OPS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

/**
 * Round-robin auto-assignment for unassigned stalled/dropped signups.
 * Distributes evenly among ops admins with provider_ops access.
 */
export async function POST(request: NextRequest) {
  try {
    const { user: adminUser } = await requireAdminSection(ADMIN_SECTION_PROVIDER_OPS, request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    const body = await request.json();
    const userIds: string[] = body.user_ids || [];
    const assignTo: string | undefined = body.assign_to;

    if (userIds.length === 0) {
      return successResponse({ assigned: 0, message: "No users to assign" });
    }

    let targetAdminIds: string[] = [];

    if (assignTo) {
      targetAdminIds = [assignTo];
    } else {
      const { data: admins } = await supabase
        .from("users")
        .select("id")
        .eq("tenant_id", tenantId)
        .in("role", ["superadmin", "admin_operations", "admin_support"]);

      targetAdminIds = (admins || []).map((a) => a.id);
    }

    if (targetAdminIds.length === 0) {
      return successResponse({
        assigned: 0,
        message: "No eligible admins found for assignment",
      });
    }

    let assigned = 0;

    for (let i = 0; i < userIds.length; i++) {
      const userId = userIds[i];
      const adminId = targetAdminIds[i % targetAdminIds.length];

      const { error } = await supabase
        .from("provider_onboarding_tracking")
        .upsert(
          {
            user_id: userId,
            tenant_id: tenantId,
            assigned_to: adminId,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );

      if (!error) assigned++;
    }

    return successResponse({
      assigned,
      total_requested: userIds.length,
      admin_id: adminUser.id,
    });
  } catch (error) {
    return handleApiError(error, "Failed to auto-assign");
  }
}
