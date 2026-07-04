/**
 * GET /api/provider/verification/status
 *
 * Returns current provider's verification status plus whether SumSub is
 * configured. When SumSub is not available the front-end falls back to the
 * manual document-upload flow (POST /api/me/verification).
 */

import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, errorResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveVerificationPolicy } from "@/lib/verification/verification-policy";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = getSupabaseAdmin();

    // Resolve provider id
    let providerId: string | null = null;
    let providerOwnerUserId: string | null = null;
    let providerTenantId: string | null = null;
    let providerIsVerified = false;
    const { data: byOwner } = await supabase
      .from("providers")
      .select("id, user_id, tenant_id, is_verified")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    if (byOwner) {
      providerId = byOwner.id;
      providerOwnerUserId = (byOwner as { user_id?: string | null }).user_id ?? user.id;
      providerTenantId = (byOwner as { tenant_id?: string | null }).tenant_id ?? null;
      providerIsVerified = (byOwner as { is_verified?: boolean | null }).is_verified === true;
    }
    else {
      const { data: staff } = await supabase.from("provider_staff").select("provider_id").eq("user_id", user.id).limit(1).maybeSingle();
      if (staff?.provider_id) providerId = staff.provider_id;
    }
    if (!providerId) return errorResponse("Provider not found", "NOT_FOUND", 404);

    if (!providerOwnerUserId || !byOwner) {
      const { data: providerRow } = await supabase
        .from("providers")
        .select("user_id, tenant_id, is_verified")
        .eq("id", providerId)
        .maybeSingle();
      providerOwnerUserId =
        (providerRow as { user_id?: string | null } | null)?.user_id ?? user.id;
      providerTenantId =
        (providerRow as { tenant_id?: string | null } | null)?.tenant_id ?? providerTenantId;
      providerIsVerified =
        (providerRow as { is_verified?: boolean | null } | null)?.is_verified === true;
    }

    const identityUserId = providerOwnerUserId ?? user.id;

    // Sumsub verification status (KYC table)
    const { data: kycRow, error: kycError } = await supabase
      .from("provider_verification_status")
      .select("status, sumsub_applicant_id, last_reviewed_at, updated_at")
      .eq("provider_id", providerId)
      .maybeSingle();
    if (kycError) throw kycError;

    // Manual (user_verifications) — most recent record for this user
    const { data: manualRow } = await supabase
      .from("user_verifications")
      .select("id, status, document_type, submitted_at, rejection_reason")
      .eq("user_id", identityUserId)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: identityUser } = await supabase
      .from("users")
      .select("identity_verified, identity_verification_status")
      .eq("id", identityUserId)
      .maybeSingle();

    // Check verification policy for this environment and tenant.
    const { searchParams } = new URL(request.url);
    const env = searchParams.get("environment") ?? "production";
    const policy = await resolveVerificationPolicy(providerTenantId, env);

    const sumsubAvailable = policy.sumsubEnabled;
    const diditAvailable = policy.diditEnabled;

    // Derive a combined status from every provider verification surface:
    // Sumsub KYC, manual admin review, user identity flag, and public badge.
    // Approval should win because any approved path means the provider is
    // verified; rejection/reset should clear stale approved UI.
    const kycStatus = kycRow?.status ?? "pending";
    const manualStatus = manualRow?.status ?? null;
    const identityStatus =
      (identityUser as { identity_verification_status?: string | null } | null)
        ?.identity_verification_status ?? null;
    const identityVerified =
      (identityUser as { identity_verified?: boolean | null } | null)
        ?.identity_verified === true;
    let effectiveStatus = kycStatus;

    if (
      kycStatus === "approved" ||
      manualStatus === "approved" ||
      identityStatus === "approved" ||
      identityVerified ||
      providerIsVerified
    ) {
      effectiveStatus = "approved";
    } else if (
      kycStatus === "rejected" ||
      manualStatus === "rejected" ||
      identityStatus === "rejected"
    ) {
      effectiveStatus = "rejected";
    } else if (kycStatus === "reset" || identityStatus === "reset") {
      effectiveStatus = "reset";
    } else if (kycStatus === "in_progress" || manualStatus === "pending") {
      effectiveStatus = "in_progress";
    }

    return successResponse({
      // KYC / Sumsub status
      status: effectiveStatus,
      sumsub_applicant_id: kycRow?.sumsub_applicant_id ?? null,
      last_reviewed_at: kycRow?.last_reviewed_at ?? null,
      updated_at: kycRow?.updated_at ?? null,
      // Manual verification
      manual_verification: manualRow
        ? {
            id: manualRow.id,
            status: manualRow.status,
            document_type: manualRow.document_type,
            submitted_at: manualRow.submitted_at,
            rejection_reason:
              (manualRow as { rejection_reason?: string | null }).rejection_reason ?? null,
          }
        : null,
      // Most recent reviewer note (why a submission was declined), surfaced so
      // the provider knows exactly what to fix before resubmitting.
      rejection_reason:
        effectiveStatus === "rejected"
          ? (manualRow as { rejection_reason?: string | null } | null)?.rejection_reason ?? null
          : null,
      // Whether Didit automated KYC is available for this environment
      didit_available: diditAvailable,
      // @deprecated Always false (Sumsub removed). Kept for legacy client compat.
      sumsub_available: sumsubAvailable,
      // Whether manual document upload is available
      manual_available: policy.manualEnabled,
      // Combined mode: "off" | "manual" | "didit" | "both"
      verification_mode: policy.mode,
      required_for_providers: policy.requiredForProviders,
      required_for_payouts: policy.requiredForPayouts,
    });
  } catch (error) {
    return handleApiError(error as Error, "Failed to get verification status");
  }
}
