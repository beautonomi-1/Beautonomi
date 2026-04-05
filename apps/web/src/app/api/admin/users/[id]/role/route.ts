import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, notFoundResponse, handleApiError, errorResponse  } from "@/lib/supabase/api-helpers";
import { z } from "zod";
import type { UserRole } from "@/types/beautonomi";
import { writeAuditLog } from "@/lib/audit/audit";

const MANAGEABLE_USER_ROLES = [
  "customer",
  "provider_owner",
  "provider_staff",
  "support_agent",
  "admin_support",
  "admin_finance",
  "admin_trust",
  "admin_content",
  "admin_ecommerce",
  "admin_marketing",
  "admin_integrations",
  "admin_operations",
  "admin_platform_config",
  "superadmin",
] as const satisfies readonly UserRole[];

const roleUpdateSchema = z.object({
  role: z.enum(MANAGEABLE_USER_ROLES),
});

/**
 * PUT /api/admin/users/[id]/role
 * 
 * Update user role (audit logged)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["superadmin"], request);

    const { id } = await params;
    const supabase = await getSupabaseServer(request);
    const body = await request.json();

    // Validate request body
    const validationResult = roleUpdateSchema.safeParse(body);
    if (!validationResult.success) {
      return errorResponse(
        "Validation failed",
        "VALIDATION_ERROR",
        400,
        validationResult.error.issues.map((issue) => ({ path: issue.path, message: issue.message }))
      );
    }

    // Get current user data
    const { data: currentUser } = await supabase
      .from("users")
      .select("role, full_name, email")
      .eq("id", id)
      .single();

    if (!currentUser) {
      return notFoundResponse("User not found");
    }

    const newRole = validationResult.data.role as UserRole;
    const currentRow = currentUser as { role?: UserRole };
    const oldRole = currentRow.role as UserRole;

    if (id === user.id && oldRole === "superadmin" && newRole !== "superadmin") {
      return errorResponse("Cannot change your own role from superadmin", "SELF_ROLE_CHANGE", 400);
    }

    const { data: updatedUser, error } = await supabase
      .from("users")
      .update({ role: newRole })
      .eq("id", id)
      .select()
      .single();

    if (error || !updatedUser) {
      throw error || new Error("Failed to update user role");
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
      action: "admin.user.role.update",
      entity_type: "user",
      entity_id: id,
      metadata: { role: { from: oldRole, to: newRole } },
    });

    return successResponse(updatedUser);
  } catch (error) {
    return handleApiError(error, "Failed to update user role");
  }
}
