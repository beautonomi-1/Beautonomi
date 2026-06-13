import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, notFoundResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_USERS_TRUST } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { getUserRowIfAccessibleToAdminTenant } from "@/lib/tenant/admin-user-tenant-access";
import { writeAuditLog } from "@/lib/audit/audit";
import {
  resolveProviderIdForUser,
  syncProviderVerificationState,
} from "@/lib/verification/sync-provider-verification";
import { notifyIdentityVerificationReviewed } from "@/lib/verification/notify-identity-verification-reviewed";

/**
 * POST /api/admin/users/[id]/identity-verification/reset
 *
 * Clears the user's identity verification outcome so they can submit again
 * (manual upload or Sumsub). Historical rows in `user_verifications` are kept.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_USERS_TRUST, request);
    const { id } = await params;
    const admin = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    const existingRow = await getUserRowIfAccessibleToAdminTenant(admin, tenantId, id);
    if (!existingRow) {
      return notFoundResponse("User not found");
    }

    const existingUser = existingRow as { id?: string; role?: string };
    if (existingUser.role === "superadmin" && id !== user.id) {
      return notFoundResponse("User not found");
    }

    const now = new Date().toISOString();

    const supersedeReason =
      "Verification reset by admin — submit new documents if you are asked to re-verify.";
    await admin
      .from("user_verifications")
      .update({
        status: "rejected",
        rejection_reason: supersedeReason,
        reviewed_at: now,
        reviewed_by: user.id,
      })
      .eq("user_id", id)
      .in("status", ["pending", "in_progress", "submitted", "under_review"]);

    const { data: updated, error } = await admin
      .from("users")
      .update({
        identity_verified: false,
        identity_verification_status: "none",
        identity_verification_submitted_at: null,
        identity_verification_reviewed_at: null,
        identity_verification_reviewed_by: null,
        updated_at: now,
      })
      .eq("id", id)
      .select("id, identity_verified, identity_verification_status")
      .single();

    if (error) throw error;

    // §provider-verification-sync 2026-05: reset must clear the public
    // verified badge and the provider KYC row too, otherwise an old
    // `approved` KYC entry would silently re-grant the badge on the next
    // setup-status fetch.
    let linkedProviderId: string | null = null;
    try {
      linkedProviderId = await resolveProviderIdForUser(admin, id);
      if (linkedProviderId) {
        await syncProviderVerificationState(admin, {
          providerId: linkedProviderId,
          userId: id,
          status: "reset",
          source: "admin_reset",
          metadata: {
            reset_by_user_id: user.id,
            reset_reason: supersedeReason,
          },
        });
      }
    } catch (syncErr) {
      console.error("Failed to sync provider verification on reset:", syncErr);
    }

    // Awaited so serverless doesn't freeze before the send completes;
    // the helper never throws (errors are logged and swallowed).
    await notifyIdentityVerificationReviewed({
      userId: id,
      outcome: "rejected",
      rejectionReason: supersedeReason,
      isProvider: Boolean(linkedProviderId),
      tenantId,
    });

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
      action: "admin.user.identity_verification_reset",
      entity_type: "user",
      entity_id: id,
      metadata: { tenant_id: tenantId },
    });

    return successResponse({
      user: updated,
      message:
        "Identity verification state cleared. The customer can submit documents again; previous submissions remain in history.",
    });
  } catch (error) {
    return handleApiError(error, "Failed to reset identity verification");
  }
}
