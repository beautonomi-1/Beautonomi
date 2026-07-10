/**
 * Load provider entity + verification step statuses for plan resolution.
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getVerificationStatus, getBusinessVerificationStatus } from "@/lib/identity-verification/identity-verification-service";
import type { NormalizedVerificationStatus } from "@/lib/identity-verification/types";
import { resolveVerificationPolicy } from "@/lib/verification/verification-policy";
import {
  isVerificationPlanComplete,
  resolveProviderVerificationPlan,
  type PayeeKind,
  type VerificationPlan,
} from "@/lib/verification/verification-plan";

export interface ProviderPayeeEntity {
  payee_kind: PayeeKind;
  registered_business_name: string | null;
  business_registration_number: string | null;
  business_registration_country: string | null;
  verified_person_role: "owner" | "authorized_representative" | null;
  business_type: string | null;
}

export interface ProviderVerificationState {
  providerId: string;
  tenantId: string | null;
  ownerUserId: string;
  entity: ProviderPayeeEntity;
  personKycStatus: string;
  businessKybStatus: string;
  manualStatus: string | null;
  plan: VerificationPlan;
  isComplete: boolean;
}

function normalisePayeeKind(raw: string | null | undefined): PayeeKind {
  return raw === "business" ? "business" : "individual";
}

export async function loadProviderPayeeEntity(
  providerId: string,
): Promise<ProviderPayeeEntity | null> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("providers")
    .select(
      "payee_kind, registered_business_name, business_registration_number, business_registration_country, verified_person_role, business_type",
    )
    .eq("id", providerId)
    .maybeSingle();

  if (!data) return null;

  return {
    payee_kind: normalisePayeeKind((data as { payee_kind?: string }).payee_kind),
    registered_business_name:
      (data as { registered_business_name?: string | null }).registered_business_name ?? null,
    business_registration_number:
      (data as { business_registration_number?: string | null }).business_registration_number ??
      null,
    business_registration_country:
      (data as { business_registration_country?: string | null }).business_registration_country ??
      null,
    verified_person_role:
      ((data as { verified_person_role?: string | null }).verified_person_role as
        | "owner"
        | "authorized_representative"
        | null) ?? null,
    business_type: (data as { business_type?: string | null }).business_type ?? null,
  };
}

export async function loadProviderVerificationState(
  providerId: string,
): Promise<ProviderVerificationState | null> {
  const supabase = getSupabaseAdmin();
  const { data: providerRow } = await supabase
    .from("providers")
    .select("user_id, tenant_id, payee_kind, kyb_verification_status")
    .eq("id", providerId)
    .maybeSingle();

  if (!providerRow) return null;

  const ownerUserId = (providerRow as { user_id: string }).user_id;
  const tenantId = (providerRow as { tenant_id?: string | null }).tenant_id ?? null;
  const entity = await loadProviderPayeeEntity(providerId);
  if (!entity) return null;

  const policy = await resolveVerificationPolicy(tenantId);
  const plan = resolveProviderVerificationPlan(policy, entity.payee_kind, {
    registrationCountry: entity.business_registration_country,
  });

  const [personKycStatus, businessKybStatus, manualRow] = await Promise.all([
    getVerificationStatus(ownerUserId, "provider", providerId, "user"),
    getBusinessVerificationStatus(providerId),
    supabase
      .from("user_verifications")
      .select("status")
      .eq("user_id", ownerUserId)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const manualStatus =
    (manualRow.data as { status?: string | null } | null)?.status ?? null;

  let businessKybStatusResolved = businessKybStatus;
  if (entity.payee_kind === "individual" || !plan.kybEnabled) {
    businessKybStatusResolved = "not_required";
  } else if (
    businessKybStatus === "not_started" &&
    (providerRow as { kyb_verification_status?: string }).kyb_verification_status
  ) {
    businessKybStatusResolved = (providerRow as { kyb_verification_status: string })
      .kyb_verification_status as NormalizedVerificationStatus;
  }

  const isComplete = isVerificationPlanComplete(plan, {
    personKycStatus,
    businessKybStatus: businessKybStatusResolved,
    manualStatus,
  });

  return {
    providerId,
    tenantId,
    ownerUserId,
    entity,
    personKycStatus,
    businessKybStatus: businessKybStatusResolved,
    manualStatus,
    plan,
    isComplete,
  };
}

/** Whether provider satisfies all required verification steps per current policy. */
export async function isProviderVerificationPlanComplete(
  providerId: string,
): Promise<boolean> {
  const state = await loadProviderVerificationState(providerId);
  return state?.isComplete ?? false;
}
