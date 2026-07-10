import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSectionAny,
  handleApiError,
  successResponse,
  notFoundResponse,
  errorResponse,
 } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDERS_OPERATIONS, ADMIN_SECTION_PROVIDER_OPS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit/audit";
import { syncProviderVerificationState } from "@/lib/verification/sync-provider-verification";
import { clearIdentityVerificationForReverify } from "@/lib/verification/clear-identity-verification-for-reverify";

/**
 * PATCH /api/admin/providers/[id]/verify
 * 
 * Update provider verification status. Uses admin client to bypass RLS.
 */
const updateVerificationSchema = z.object({
  verified: z.boolean(),
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
      .select("id, user_id, business_name")
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .single();

    if (!provider) {
      return notFoundResponse("Provider not found");
    }

    const providerRow = provider as {
      id: string;
      user_id?: string | null;
      business_name?: string | null;
    };

    // Keep admin badge toggles in sync with provider KYC and user identity
    // state. A direct `providers.is_verified` write caused the mobile
    // verification screen, setup checklist, and marketplace badge to drift.
    const syncResult = verified
      ? await syncProviderVerificationState(supabase, {
          providerId: id,
          userId: providerRow.user_id ?? null,
          status: "approved",
          source: "manual_admin",
          metadata: {
            admin_provider_verify_toggle: true,
            reviewed_by_user_id: user.id,
          },
        })
      : await clearIdentityVerificationForReverify(supabase, {
          userId: providerRow.user_id ?? "",
          providerId: id,
          adminUserId: user.id,
          metadata: {
            admin_provider_verify_toggle: true,
            reviewed_by_user_id: user.id,
          },
        });

    if (!syncResult.ok) {
      return handleApiError(
        new Error(syncResult.errors.join("; ") || "Verification sync failed"),
        "Failed to update verification status",
      );
    }

    const { data: updatedProvider, error: updatedFetchError } = await supabase
      .from("providers")
      .select()
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .single();

    if (updatedFetchError || !updatedProvider) {
      return handleApiError(updatedFetchError, "Failed to fetch updated provider");
    }

    // Audit + notify provider owner user
    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
      action: "admin.provider.verify",
      entity_type: "provider",
      entity_id: id,
      metadata: { verified },
    });

    try {
      const { sendToUser } = await import("@/lib/notifications/onesignal");
      const providerUserId = providerRow.user_id ?? null;
      if (providerUserId) {
        await sendToUser(
          providerUserId,
          {
            title: verified ? "Account Verified" : "Verification Updated",
            message: verified
              ? `Your business ${providerRow.business_name ?? ""} has been verified.`
              : `Your verification status has been updated.`,
            data: { type: "provider_verification", provider_id: id, verified },
            url: `/provider`,
          },
          ["push"],
          { appType: "provider" }
        );
      }
    } catch (e) {
      console.error("Failed to notify provider verification:", e);
    }

    return successResponse(updatedProvider);
  } catch (error) {
    return handleApiError(error, "Failed to update verification status");
  }
}
