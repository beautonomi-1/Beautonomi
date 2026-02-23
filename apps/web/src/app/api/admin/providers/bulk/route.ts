import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { successResponse, errorResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { writeAuditLog } from "@/lib/audit/audit";
import { z } from "zod";

const bulkActionSchema = z.object({
  provider_ids: z.array(z.string().uuid()).min(1, "At least one provider ID is required"),
  action: z.enum(["approve", "suspend", "reject", "verify", "unverify"]),
  reason: z.string().optional().nullable(),
});

/**
 * POST /api/admin/providers/bulk
 * 
 * Perform bulk actions on providers
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

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

    const { provider_ids, action, reason } = validationResult.data;

    let updateData: any = {};
    const results = { success: 0, failed: 0, errors: [] as string[] };

    switch (action) {
      case "approve":
        updateData = { status: "active" };
        break;
      case "suspend":
        updateData = { status: "suspended" };
        break;
      case "reject":
        updateData = { status: "rejected" };
        break;
      case "verify":
        updateData = { is_verified: true };
        break;
      case "unverify":
        updateData = { is_verified: false };
        break;
    }

    // Perform bulk update
    const { error: updateError } = await supabase
      .from("providers")
      .update(updateData)
      .in("id", provider_ids);

    if (updateError) {
      throw updateError;
    }

    results.success = provider_ids.length;

    // Log audit trail
    await writeAuditLog({
      actor_user_id: auth.user.id,
      actor_role: (auth.user as any).role || "superadmin",
      action: `admin.providers.bulk.${action}`,
      entity_type: "provider",
      entity_id: provider_ids.join(","),
      metadata: { provider_ids, action, reason, count: provider_ids.length },
    });

    return successResponse({
      success: true,
      results,
    });
  } catch (error) {
    return handleApiError(error, "Failed to perform bulk action");
  }
}
