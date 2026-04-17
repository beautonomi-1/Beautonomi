import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdminSection, successResponse, errorResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDERS_OPERATIONS } from "@/lib/admin-sections";
import { writeAuditLog } from "@/lib/audit/audit";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
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
    const { user } = await requireAdminSection(ADMIN_SECTION_PROVIDERS_OPERATIONS, request);

    const supabase = await getSupabaseServer(request);
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

    const tenantId = await resolveAdminApiTenantId(request);
    const { data: tenantRows, error: tenantCheckError } = await supabase
      .from("bookings")
      .select("id")
      .in("id", booking_ids)
      .eq("tenant_id", tenantId);

    if (tenantCheckError) {
      throw tenantCheckError;
    }
    if (!tenantRows || tenantRows.length !== booking_ids.length) {
      return errorResponse(
        "One or more bookings are not in the current market",
        "TENANT_MISMATCH",
        403
      );
    }

    let updateData: Record<string, unknown> = {};
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
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
      action: `admin.bookings.bulk.${action}`,
      entity_type: "booking",
      entity_id: booking_ids.join(","),
      metadata: { booking_ids, action, reason, count: booking_ids.length },
    });

    if (action === "cancel") {
      try {
        const { matchWaitlistOnCancellation } = await import("@/lib/waitlist/matching");
        await Promise.allSettled(
          booking_ids.map((bid: string) => matchWaitlistOnCancellation(supabase, bid))
        );
      } catch (waitlistErr) {
        console.error("[admin bulk cancel] waitlist matching failed:", waitlistErr);
      }
    }

    return successResponse({
      success: true,
      results,
    });
  } catch (error) {
    return handleApiError(error, "Failed to perform bulk action");
  }
}
