import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSectionAny,
  handleApiError,
  successResponse,
  notFoundResponse,
  errorResponse,
 } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDERS_OPERATIONS, ADMIN_SECTION_PROVIDER_OPS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
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
    const { user } = await requireAdminSectionAny(
      [ADMIN_SECTION_PROVIDERS_OPERATIONS, ADMIN_SECTION_PROVIDER_OPS],
      request,
    );
    if (!user) throw new Error("Authentication required");
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
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

    // Map request-level lifecycle values to the actual `provider_status` enum
    // (draft | pending_approval | active | suspended). The API historically
    // accepts synonyms (approved/pending) and "rejected" which have no enum
    // member — writing them raw fails the Postgres enum check (500). Rejection
    // is stored as `suspended` + `status_reason` (no dedicated rejected state).
    const PROVIDER_STATUS_DB_MAP: Record<string, "pending_approval" | "active" | "suspended"> = {
      pending: "pending_approval",
      approved: "active",
      active: "active",
      suspended: "suspended",
      rejected: "suspended",
    };
    const dbStatus = PROVIDER_STATUS_DB_MAP[status];

    // Verify provider exists
    const { data: provider } = await supabase
      .from("providers")
      .select("id, status")
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .single();

    if (!provider) {
      return notFoundResponse("Provider not found");
    }

    const updateData: Record<string, unknown> = {
      status: dbStatus,
      updated_at: new Date().toISOString(),
    };
    // NOTE: `providers` has no `status_reason` column; the reason is persisted
    // via the audit log below (and surfaced to the provider in the notification).

    const { data: updatedProvider, error: updateError } = await supabase
      .from("providers")
      .update(updateData)
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select()
      .single();

    if (updateError || !updatedProvider) {
      return handleApiError(updateError, "Failed to update provider status");
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
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
        .eq("tenant_id", tenantId)
        .eq("id", id)
        .single();

      if (providerWithOwner) {
        const ownerRow = providerWithOwner as { user_id?: string; business_name?: string };
        const ownerId = ownerRow.user_id;
        const businessName = ownerRow.business_name;

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
            ["push", "email", "sms"],
            { appType: "provider" }
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
