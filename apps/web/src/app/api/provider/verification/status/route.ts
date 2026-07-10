/**
 * GET /api/provider/verification/status
 *
 * Returns provider verification status, policy flags, and server-driven verification plan.
 */

import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, errorResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveVerificationPolicy } from "@/lib/verification/verification-policy";
import { loadProviderVerificationState } from "@/lib/verification/provider-verification-state";
import {
  verificationPlanProgress,
  VERIFICATION_STEP_LABELS,
  type VerificationStep,
} from "@/lib/verification/verification-plan";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = getSupabaseAdmin();

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
    } else {
      const { data: staff } = await supabase
        .from("provider_staff")
        .select("provider_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
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

    const { data: kycRow, error: kycError } = await supabase
      .from("provider_verification_status")
      .select("status, sumsub_applicant_id, last_reviewed_at, updated_at, metadata")
      .eq("provider_id", providerId)
      .maybeSingle();
    if (kycError) throw kycError;

    const { data: diditSessionRow } = await supabase
      .from("identity_verification_sessions")
      .select("status, rejection_reason")
      .eq("provider_id", providerId)
      .eq("persona_type", "provider")
      .eq("session_kind", "user")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

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

    const { searchParams } = new URL(request.url);
    const env = searchParams.get("environment") ?? "production";
    const policy = await resolveVerificationPolicy(providerTenantId, env);
    const verificationState = await loadProviderVerificationState(providerId);

    const sumsubAvailable = policy.sumsubEnabled;
    const diditAvailable = policy.diditEnabled;
    // Match plan capability (flag + KYB workflow env), not flag alone.
    const kybAvailable = verificationState?.plan.kybEnabled ?? false;

    const kycStatus = kycRow?.status ?? "pending";
    const manualStatus = manualRow?.status ?? null;
    const identityStatus =
      (identityUser as { identity_verification_status?: string | null } | null)
        ?.identity_verification_status ?? null;
    const identityVerified =
      (identityUser as { identity_verified?: boolean | null } | null)?.identity_verified === true;
    let effectiveStatus = kycStatus;

    const planComplete = verificationState?.isComplete === true;
    const kybRequired =
      verificationState?.plan.kybRequiredForBusiness === true &&
      verificationState.plan.payeeKind === "business" &&
      verificationState.plan.required_steps.includes("business_kyb");
    const personApproved =
      kycStatus === "approved" ||
      manualStatus === "approved" ||
      identityStatus === "approved" ||
      identityVerified ||
      providerIsVerified;

    // When KYB is required, overall status is approved only if the full plan is complete.
    if (kybRequired) {
      if (planComplete) {
        effectiveStatus = "approved";
      } else if (
        verificationState?.businessKybStatus === "rejected" ||
        verificationState?.personKycStatus === "rejected" ||
        kycStatus === "rejected" ||
        manualStatus === "rejected"
      ) {
        effectiveStatus = "rejected";
      } else if (
        personApproved ||
        verificationState?.personKycStatus === "in_progress" ||
        verificationState?.businessKybStatus === "in_progress" ||
        verificationState?.businessKybStatus === "pending_review"
      ) {
        effectiveStatus = "in_progress";
      } else {
        effectiveStatus = "reset";
      }
    } else if (personApproved || planComplete) {
      effectiveStatus = "approved";
    } else if (
      kycStatus === "rejected" ||
      manualStatus === "rejected" ||
      identityStatus === "rejected"
    ) {
      effectiveStatus = "rejected";
    } else if (
      kycStatus === "reset" ||
      identityStatus === "reset" ||
      kycStatus === "not_started" ||
      identityStatus === "none" ||
      identityStatus === "not_started"
    ) {
      effectiveStatus = "reset";
    } else if (kycStatus === "in_progress" || manualStatus === "pending") {
      effectiveStatus = "in_progress";
    }

    const kycMetadata = (kycRow as { metadata?: Record<string, unknown> } | null)?.metadata;
    const kycRejectionFromMetadata =
      typeof kycMetadata?.rejection_reason === "string" ? kycMetadata.rejection_reason : null;
    const diditRejectionReason =
      (diditSessionRow as { rejection_reason?: string | null } | null)?.rejection_reason ?? null;
    const manualRejectionReason =
      (manualRow as { rejection_reason?: string | null } | null)?.rejection_reason ?? null;
    const combinedRejectionReason =
      effectiveStatus === "rejected"
        ? diditRejectionReason ?? manualRejectionReason ?? kycRejectionFromMetadata
        : null;

    const plan = verificationState?.plan ?? null;
    const progress = plan && verificationState
      ? verificationPlanProgress(plan, {
          personKycStatus: verificationState.personKycStatus,
          businessKybStatus: verificationState.businessKybStatus,
          manualStatus: verificationState.manualStatus,
        })
      : { completed: 0, total: 0 };

    const stepStatuses: Partial<Record<VerificationStep, string>> = verificationState
      ? {
          person_kyc: verificationState.personKycStatus,
          business_kyb: verificationState.businessKybStatus,
          manual_upload: verificationState.manualStatus ?? "not_started",
          manual_business_review: verificationState.businessKybStatus,
        }
      : {};

    const steps = plan
      ? [...plan.required_steps, ...plan.optional_steps].map((step) => ({
          step,
          required: plan.required_steps.includes(step),
          label: VERIFICATION_STEP_LABELS[step].title,
          description: VERIFICATION_STEP_LABELS[step].description,
          status: stepStatuses[step] ?? "not_started",
          locked:
            step === "business_kyb" &&
            verificationState?.personKycStatus !== "approved" &&
            plan.kybRequiredForBusiness,
        }))
      : [];

    return successResponse({
      status: effectiveStatus,
      sumsub_applicant_id: kycRow?.sumsub_applicant_id ?? null,
      last_reviewed_at: kycRow?.last_reviewed_at ?? null,
      updated_at: kycRow?.updated_at ?? null,
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
      rejection_reason: combinedRejectionReason,
      didit_available: diditAvailable,
      kyb_available: kybAvailable,
      sumsub_available: sumsubAvailable,
      manual_available: policy.manualEnabled,
      verification_mode: policy.mode,
      required_for_providers: policy.requiredForProviders,
      required_for_payouts: policy.requiredForPayouts,
      verification_plan: plan
        ? {
            mode: plan.mode,
            payee_kind: plan.payeeKind,
            required_steps: plan.required_steps,
            optional_steps: plan.optional_steps,
            kyb_enabled: plan.kybEnabled,
            kyb_required_for_business: plan.kybRequiredForBusiness,
            kyb_country_unsupported: plan.kyb_country_unsupported,
            effective_summary: plan.effective_summary,
            progress,
            steps,
            is_complete: verificationState?.isComplete ?? false,
          }
        : null,
      payee_entity: verificationState?.entity ?? null,
      person_kyc_status: verificationState?.personKycStatus ?? null,
      business_kyb_status: verificationState?.businessKybStatus ?? null,
    });
  } catch (error) {
    return handleApiError(error as Error, "Failed to get verification status");
  }
}
