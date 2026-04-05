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

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = getSupabaseAdmin();

    // Resolve provider id
    let providerId: string | null = null;
    const { data: byOwner } = await supabase.from("providers").select("id").eq("user_id", user.id).limit(1).maybeSingle();
    if (byOwner) providerId = byOwner.id;
    else {
      const { data: staff } = await supabase.from("provider_staff").select("provider_id").eq("user_id", user.id).limit(1).maybeSingle();
      if (staff?.provider_id) providerId = staff.provider_id;
    }
    if (!providerId) return errorResponse("Provider not found", "NOT_FOUND", 404);

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
      .select("id, status, document_type, submitted_at")
      .eq("user_id", user.id)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Check if SumSub is configured and enabled
    const { searchParams } = new URL(request.url);
    const env = searchParams.get("environment") ?? "production";
    const { data: sumsubConfig } = await supabase
      .from("sumsub_integration_config")
      .select("enabled, app_token_secret, secret_key_secret")
      .eq("environment", env)
      .maybeSingle();

    const sumsubAvailable = Boolean(
      sumsubConfig?.enabled &&
      sumsubConfig?.app_token_secret &&
      sumsubConfig?.secret_key_secret
    );

    // Derive a combined status: if KYC table says approved, that's authoritative.
    // Otherwise fall back to manual doc status if submitted.
    const kycStatus = kycRow?.status ?? "pending";
    let effectiveStatus = kycStatus;

    // If manual doc has been submitted and KYC is still pending, surface "in_progress"
    if (kycStatus === "pending" && manualRow?.status === "pending") {
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
          }
        : null,
      // Whether SumSub is available for this environment
      sumsub_available: sumsubAvailable,
    });
  } catch (error) {
    return handleApiError(error as Error, "Failed to get verification status");
  }
}
