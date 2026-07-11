/**
 * Session status for UI/gates, falling back to legacy user columns when no Didit
 * session exists (e.g. Sumsub/admin-approved users).
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getVerificationStatus } from "./identity-verification-service";
import type { NormalizedVerificationStatus, VerificationPersona } from "./types";
import {
  isProviderVerificationPlanComplete,
  loadProviderVerificationState,
} from "@/lib/verification/provider-verification-state";
import { planRequiresBusinessVerification } from "@/lib/verification/verification-plan";

export async function resolveEffectiveVerificationDisplayStatus(
  userId: string,
  persona: VerificationPersona,
  providerId?: string | null,
): Promise<NormalizedVerificationStatus> {
  const sessionStatus = await getVerificationStatus(userId, persona, providerId, "user");

  if (persona === "provider" && providerId) {
    const state = await loadProviderVerificationState(providerId);
    if (state && planRequiresBusinessVerification(state.plan)) {
      if (state.isComplete) return "approved";
      if (sessionStatus === "rejected") return "rejected";
      if (
        state.personKycStatus === "approved" &&
        state.businessKybStatus !== "approved"
      ) {
        return "pending_review";
      }
      return sessionStatus === "approved" ? "in_progress" : sessionStatus;
    }

    const planComplete = await isProviderVerificationPlanComplete(providerId);
    if (planComplete) return "approved";
  }

  if (sessionStatus === "approved") return "approved";

  const supabase = getSupabaseAdmin();
  const { data: userRow } = await supabase
    .from("users")
    .select("identity_verified, identity_verification_status")
    .eq("id", userId)
    .maybeSingle();

  const legacyUserApproved =
    (userRow as { identity_verified?: boolean | null } | null)?.identity_verified === true ||
    (userRow as { identity_verification_status?: string | null } | null)
      ?.identity_verification_status === "approved";

  if (legacyUserApproved) {
    if (persona === "provider" && providerId) {
      const planComplete = await isProviderVerificationPlanComplete(providerId);
      if (!planComplete) return "pending_review";
    }
    return "approved";
  }

  if (persona === "provider" && providerId) {
    const [{ data: kycRow }, { data: providerRow }] = await Promise.all([
      supabase
        .from("provider_verification_status")
        .select("status")
        .eq("provider_id", providerId)
        .maybeSingle(),
      supabase.from("providers").select("is_verified").eq("id", providerId).maybeSingle(),
    ]);

    if (
      (kycRow as { status?: string | null } | null)?.status === "approved" ||
      (providerRow as { is_verified?: boolean | null } | null)?.is_verified === true
    ) {
      const planComplete = await isProviderVerificationPlanComplete(providerId);
      if (!planComplete) return "pending_review";
      return "approved";
    }
  }

  return sessionStatus;
}
