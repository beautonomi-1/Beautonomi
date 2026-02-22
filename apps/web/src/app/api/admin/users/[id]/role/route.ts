import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { z } from "zod";
import type { UserRole } from "@/types/beautonomi";
import { writeAuditLog } from "@/lib/audit/audit";

const roleUpdateSchema = z.object({
  role: z.enum(["customer", "provider_owner", "provider_staff", "superadmin"]),
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
    const { user } = await requireRoleInApi(['superadmin']);

    const { id } = await params;
    const supabase = await getSupabaseServer();
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
    const oldRole = (currentUser as any).role as UserRole;

    // Prevent changing own role from superadmin
    if (id === user.id && oldRole === "superadmin" && newRole !== "superadmin") {
      return errorResponse("Cannot change your own role from superadmin", "SELF_ROLE_CHANGE", 400);
    }

    // Update user role
    const { data: updatedUser, error } = await (supabase
      .from("users") as any)
      .update({ role: newRole })
      .eq("id", id)
      .select()
      .single();

    if (error || !updatedUser) {
      throw error || new Error("Failed to update user role");
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: (user as any).role || "superadmin",
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
