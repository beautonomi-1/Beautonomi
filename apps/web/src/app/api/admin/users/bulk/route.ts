import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { writeAuditLog } from "@/lib/audit/audit";
import { z } from "zod";

const bulkActionSchema = z.object({
  user_ids: z.array(z.string().uuid()).min(1, "At least one user ID is required"),
  action: z.enum(["activate", "deactivate", "delete", "change_role"]),
  role: z.enum(["customer", "provider", "superadmin"]).optional(),
  reason: z.string().optional().nullable(),
});

/**
 * POST /api/admin/users/bulk
 * 
 * Perform bulk actions on users
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer();
    const body = await request.json();

    // Validate request body
    const validationResult = bulkActionSchema.safeParse(body);
    if (!validationResult.success) {
      return errorResponse(
        "Validation failed",
        "VALIDATION_ERROR",
        400,
        validationResult.error.issues
      );
    }

    const { user_ids, action, role, reason } = validationResult.data;

    // Check if any selected users are superadmins (for delete/deactivate)
    if (action === "delete" || action === "deactivate") {
      const { data: superadmins } = await supabase
        .from("users")
        .select("id, email")
        .in("id", user_ids)
        .eq("role", "superadmin");

      if (superadmins && superadmins.length > 0) {
        return errorResponse(
          "Cannot delete or deactivate superadmin accounts",
          "INVALID_ACTION",
          400
        );
      }
    }

    let updateData: any = {};
    const results = { success: 0, failed: 0, errors: [] as string[] };

    switch (action) {
      case "activate":
        updateData = {
          deactivated_at: null,
          deactivation_reason: null,
        };
        break;
      case "deactivate":
        updateData = {
          deactivated_at: new Date().toISOString(),
          deactivation_reason: reason || "Bulk deactivation by admin",
        };
        break;
      case "change_role":
        if (!role) {
          return errorResponse(
            "Role is required for change_role action",
            "VALIDATION_ERROR",
            400
          );
        }
        updateData = { role };
        break;
      case "delete":
        // For delete, we'll handle it separately
        break;
    }

    // Perform bulk update or delete
    if (action === "delete") {
      // Delete users (cascade will handle related data)
      const { error: deleteError } = await supabase
        .from("users")
        .delete()
        .in("id", user_ids);

      if (deleteError) {
        throw deleteError;
      }

      results.success = user_ids.length;
    } else {
      // Bulk update
      const { error: updateError } = await supabase
        .from("users")
        .update(updateData)
        .in("id", user_ids);

      if (updateError) {
        throw updateError;
      }

      results.success = user_ids.length;
    }

    // Log audit trail
    await writeAuditLog({
      actor_user_id: auth.user.id,
      actor_role: (auth.user as any).role || "superadmin",
      action: `admin.users.bulk.${action}`,
      entity_type: "user",
      entity_id: user_ids.join(","),
      metadata: { user_ids, action, role, reason, count: user_ids.length },
    });

    return successResponse({
      success: true,
      results,
    });
  } catch (error) {
    return handleApiError(error, "Failed to perform bulk action");
  }
}
