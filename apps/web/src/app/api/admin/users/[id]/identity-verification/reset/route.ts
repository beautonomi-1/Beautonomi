import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, notFoundResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_USERS_TRUST } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { getUserRowIfAccessibleToAdminTenant } from "@/lib/tenant/admin-user-tenant-access";
import { writeAuditLog } from "@/lib/audit/audit";
import { resolveProviderIdForUser } from "@/lib/verification/sync-provider-verification";
import { clearIdentityVerificationForReverify } from "@/lib/verification/clear-identity-verification-for-reverify";
import { notifyIdentityVerificationReviewed } from "@/lib/verification/notify-identity-verification-reviewed";

/**
 * POST /api/admin/users/[id]/identity-verification/reset
 *
 * Clears the user's identity verification outcome so they can submit again
 * (manual upload or Didit). Historical rows in `user_verifications` are kept.
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

    const supersedeReason =
      "Verification reset by admin — submit new documents if you are asked to re-verify.";

    let linkedProviderId: string | null = null;
    try {
      linkedProviderId = await resolveProviderIdForUser(admin, id);
    } catch (syncErr) {
      console.error("Failed to resolve provider for identity reset:", syncErr);
    }

    const clearResult = await clearIdentityVerificationForReverify(admin, {
      userId: id,
      providerId: linkedProviderId,
      adminUserId: user.id,
      reason: supersedeReason,
      metadata: {
        reset_by_user_id: user.id,
        reset_reason: supersedeReason,
      },
    });

    if (!clearResult.ok) {
      return handleApiError(
        new Error(clearResult.errors.join("; ") || "Verification reset failed"),
        "Failed to reset identity verification",
      );
    }

    const { data: updated, error } = await admin
      .from("users")
      .select("id, identity_verified, identity_verification_status")
      .eq("id", id)
      .single();

    if (error) throw error;

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
      metadata: {
        tenant_id: tenantId,
        sessions_abandoned: clearResult.sessionsAbandoned,
      },
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
