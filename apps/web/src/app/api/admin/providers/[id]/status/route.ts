import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  handleApiError,
  successResponse,
  notFoundResponse,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { writeAuditLog } from "@/lib/audit/audit";
import { z } from "zod";

/**
 * PATCH /api/admin/providers/[id]/status
 * 
 * Update provider status (approve, reject, suspend, reactivate). Uses admin client to bypass RLS.
 */
const updateProviderStatusSchema = z.object({
  status: z.enum(["pending", "active", "suspended", "rejected", "approved"]),
  reason: z.string().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRoleInApi(["superadmin"], request);
    if (!auth) throw new Error("Authentication required");
    const supabase = getSupabaseAdmin();
    const { id } = await params;
    const body = await request.json();

    // Validate input
    const validationResult = updateProviderStatusSchema.safeParse(body);
    if (!validationResult.success) {
      return errorResponse(
        "Invalid input data",
        "VALIDATION_ERROR",
        400,
        validationResult.error.issues
      );
    }

    const { status, reason } = validationResult.data;

    // Verify provider exists
    const { data: provider } = await supabase
      .from("providers")
      .select("id, status")
      .eq("id", id)
      .single();

    if (!provider) {
      return notFoundResponse("Provider not found");
    }

    // Update provider status
    const updateData: any = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (reason) {
      updateData.status_reason = reason;
    }

    const { data: updatedProvider, error: updateError } = await (supabase
      .from("providers") as any)
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (updateError || !updatedProvider) {
      return handleApiError(updateError, "Failed to update provider status");
    }

    await writeAuditLog({
      actor_user_id: auth.user.id,
      actor_role: (auth.user as any).role || "superadmin",
      action: "admin.provider.status",
      entity_type: "provider",
      entity_id: id,
      metadata: { previous_status: provider.status, new_status: status, reason },
    });

    // Send notification using templates
    try {
      const { sendTemplateNotification } = await import("@/lib/notifications/onesignal");
      
      // Get provider owner
      const { data: providerWithOwner } = await supabase
        .from("providers")
        .select("user_id, business_name")
        .eq("id", id)
        .single();

      if (providerWithOwner) {
        const ownerId = (providerWithOwner as any).user_id;
        const businessName = (providerWithOwner as any).business_name;

        let templateKey: string | null = null;
        const variables: Record<string, string> = {
          business_name: businessName,
        };

        // Determine template based on status
        if (status === "active" || status === "approved") {
          // Check if this is a reactivation (was suspended before) or new approval
          if (provider.status === "suspended") {
            templateKey = "provider_reactivated";
          } else {
            templateKey = "provider_approved";
          }
        } else if (status === "suspended") {
          templateKey = "provider_suspended";
          variables.reason = reason || "Please contact support for more information.";
        } else if (status === "rejected") {
          templateKey = "provider_profile_rejected";
          variables.rejection_reason = reason || "Please contact support for more information.";
        }

        // Send notification using template
        if (templateKey) {
          // Send via push, email, and SMS
          await sendTemplateNotification(
            templateKey,
            [ownerId],
            variables,
            ["push", "email", "sms"]
          );
        }
      }
    } catch (notifError) {
      console.error("Error sending notification:", notifError);
      // Don't fail the request if notification fails
    }

    return successResponse(updatedProvider);
  } catch (error) {
    return handleApiError(error, "Failed to update provider status");
  }
}
