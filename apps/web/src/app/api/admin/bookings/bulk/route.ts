import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { successResponse, errorResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { writeAuditLog } from "@/lib/audit/audit";
import { z } from "zod";

const bulkActionSchema = z.object({
  booking_ids: z.array(z.string().uuid()).min(1, "At least one booking ID is required"),
  action: z.enum(["cancel", "complete", "export"]),
  reason: z.string().optional().nullable(),
});

/**
 * POST /api/admin/bookings/bulk
 * 
 * Perform bulk actions on bookings
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
        400
      );
    }

    const { booking_ids, action, reason } = validationResult.data;

    let updateData: any = {};
    const results = { success: 0, failed: 0, errors: [] as string[] };

    switch (action) {
      case "cancel":
        updateData = { status: "cancelled" };
        break;
      case "complete":
        updateData = { status: "completed" };
        break;
      case "export":
        // Export is handled separately, just return success
        return successResponse({
          success: true,
          message: "Export functionality should use /api/admin/export/bookings",
        });
    }

    // Perform bulk update
    const { error: updateError } = await supabase
      .from("bookings")
      .update(updateData)
      .in("id", booking_ids);

    if (updateError) {
      throw updateError;
    }

    results.success = booking_ids.length;

    // Log audit trail
    await writeAuditLog({
      actor_user_id: auth.user.id,
      actor_role: (auth.user as any).role || "superadmin",
      action: `admin.bookings.bulk.${action}`,
      entity_type: "booking",
      entity_id: booking_ids.join(","),
      metadata: { booking_ids, action, reason, count: booking_ids.length },
    });

    return successResponse({
      success: true,
      results,
    });
  } catch (error) {
    return handleApiError(error, "Failed to perform bulk action");
  }
}
