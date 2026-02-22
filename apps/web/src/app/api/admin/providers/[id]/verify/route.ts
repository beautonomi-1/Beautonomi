import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  handleApiError,
  successResponse,
  notFoundResponse,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit/audit";

/**
 * PATCH /api/admin/providers/[id]/verify
 * 
 * Update provider verification status
 */
const updateVerificationSchema = z.object({
  verified: z.boolean(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRoleInApi(["superadmin"]);
    if (!auth) throw new Error("Authentication required");
    const supabase = await getSupabaseServer();
    const { id } = await params;
    const body = await request.json();

    // Validate input
    const validationResult = updateVerificationSchema.safeParse(body);
    if (!validationResult.success) {
      return errorResponse(
        "Invalid input data",
        "VALIDATION_ERROR",
        400,
        validationResult.error.issues
      );
    }

    const { verified } = validationResult.data;

    // Verify provider exists
    const { data: provider } = await supabase
      .from("providers")
      .select("id")
      .eq("id", id)
      .single();

    if (!provider) {
      return notFoundResponse("Provider not found");
    }

    // Update verification status
    const { data: updatedProvider, error: updateError } = await (supabase
      .from("providers") as any)
      .update({
        is_verified: verified,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError || !updatedProvider) {
      return handleApiError(updateError, "Failed to update verification status");
    }

    // Audit + notify provider owner user
    await writeAuditLog({
      actor_user_id: auth.user.id,
      actor_role: (auth.user as any).role || "superadmin",
      action: "admin.provider.verify",
      entity_type: "provider",
      entity_id: id,
      metadata: { verified },
    });

    try {
      const { sendToUser } = await import("@/lib/notifications/onesignal");
      const { data: providerRow } = await supabase
        .from("providers")
        .select("user_id, business_name")
        .eq("id", id)
        .single();

      const providerUserId = (providerRow as any)?.user_id;
      if (providerUserId) {
        await sendToUser(providerUserId, {
          title: verified ? "Account Verified" : "Verification Updated",
          message: verified
            ? `Your business ${(providerRow as any)?.business_name || ""} has been verified.`
            : `Your verification status has been updated.`,
          data: { type: "provider_verification", provider_id: id, verified },
          url: `/provider`,
        });
      }
    } catch (e) {
      console.error("Failed to notify provider verification:", e);
    }

    return successResponse(updatedProvider);
  } catch (error) {
    return handleApiError(error, "Failed to update verification status");
  }
}
