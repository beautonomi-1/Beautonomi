/**
 * Provider verification plan — dynamic steps from superadmin policy + payee_kind.
 *
 * Clients render only what `required_steps` / `optional_steps` contain.
 */

import type { VerificationPolicy } from "./verification-policy";
import {
  getEffectiveDiditKybWorkflowId,
  getEffectiveDiditWorkflowId,
  kybEnvPresent,
} from "@/lib/identity-verification/provider/didit-provider";
import { isDiditKybCountrySupported } from "@/lib/verification/kyb-country-support";

export type PayeeKind = "individual" | "business";

export type VerificationStep =
  | "person_kyc"
  | "business_kyb"
  | "manual_upload"
  | "manual_business_review";

export type VerificationPlanMode =
  | "off"
  | "manual"
  | "didit_kyc"
  | "didit_kyc_kyb"
  | "both_with_manual";

export interface VerificationPlan {
  mode: VerificationPlanMode;
  diditEnabled: boolean;
  kybEnabled: boolean;
  kybRequiredForBusiness: boolean;
  manualEnabled: boolean;
  kycWorkflowId: string | null;
  kybWorkflowId: string | null;
  payeeKind: PayeeKind;
  required_steps: VerificationStep[];
  optional_steps: VerificationStep[];
  blocking_for_go_live: boolean;
  blocking_for_payouts: boolean;
  /** True when registration country is outside Didit KYB coverage. */
  kyb_country_unsupported: boolean;
  /** Human-readable summary for admin preview */
  effective_summary: string;
}

export interface StepCompletionInput {
  personKycStatus: string;
  businessKybStatus: string;
  manualStatus?: string | null;
}

function derivePlanMode(policy: VerificationPolicy): VerificationPlanMode {
  const kybOn = policy.kybEnabled && policy.diditEnabled;
  if (policy.diditEnabled && policy.manualEnabled) {
    return "both_with_manual";
  }
  if (policy.diditEnabled) {
    return kybOn ? "didit_kyc_kyb" : "didit_kyc";
  }
  if (policy.manualEnabled) return "manual";
  return "off";
}

function buildEffectiveSummary(
  payeeKind: PayeeKind,
  required: VerificationStep[],
  optional: VerificationStep[],
): string {
  const parts: string[] = [];
  if (required.includes("person_kyc")) parts.push("Person identity (KYC)");
  if (required.includes("business_kyb")) parts.push("Business verification (KYB) — required");
  if (optional.includes("business_kyb")) parts.push("Business verification (KYB) — optional");
  if (required.includes("manual_upload")) parts.push("Manual document upload");
  if (required.includes("manual_business_review")) {
    parts.push("Manual business document review");
  }
  if (parts.length === 0) return "No verification steps";
  const prefix =
    payeeKind === "individual" ? "Individual provider: " : "Registered business: ";
  return prefix + parts.join("; ");
}

export interface ResolvePlanOptions {
  /** ISO alpha-2 registration country; when unsupported, KYB becomes manual review. */
  registrationCountry?: string | null;
}

/**
 * Resolve the verification checklist for a provider given policy and entity type.
 */
export function resolveProviderVerificationPlan(
  policy: VerificationPolicy,
  payeeKind: PayeeKind,
  options: ResolvePlanOptions = {},
): VerificationPlan {
  const kybEnabled =
    policy.kybEnabled && policy.diditEnabled && kybEnvPresent();
  const kycWorkflowId = policy.diditEnabled ? getEffectiveDiditWorkflowId() : null;
  const kybWorkflowId = kybEnabled ? getEffectiveDiditKybWorkflowId() : null;
  const countrySupported = isDiditKybCountrySupported(options.registrationCountry ?? null);
  const kybCountryUnsupported = kybEnabled && payeeKind === "business" && !countrySupported;

  const required_steps: VerificationStep[] = [];
  const optional_steps: VerificationStep[] = [];

  if (policy.diditEnabled) {
    required_steps.push("person_kyc");
  } else if (policy.manualEnabled) {
    required_steps.push("manual_upload");
  }

  if (kybEnabled && payeeKind === "business") {
    if (kybCountryUnsupported) {
      // Automated KYB unavailable for this country — fall back to manual review.
      if (policy.kybRequiredForBusiness) {
        required_steps.push("manual_business_review");
      } else {
        optional_steps.push("manual_business_review");
      }
    } else if (policy.kybRequiredForBusiness) {
      required_steps.push("business_kyb");
    } else {
      optional_steps.push("business_kyb");
    }
  }

  const blocking_for_go_live = policy.requiredForProviders;
  const blocking_for_payouts = policy.requiredForPayouts;

  return {
    mode: derivePlanMode(policy),
    diditEnabled: policy.diditEnabled,
    kybEnabled,
    kybRequiredForBusiness: policy.kybRequiredForBusiness,
    manualEnabled: policy.manualEnabled,
    kycWorkflowId,
    kybWorkflowId,
    payeeKind,
    required_steps,
    optional_steps,
    blocking_for_go_live,
    blocking_for_payouts,
    kyb_country_unsupported: kybCountryUnsupported,
    effective_summary: buildEffectiveSummary(payeeKind, required_steps, optional_steps),
  };
}

function isApprovedStatus(status: string): boolean {
  return status === "approved";
}

function isSatisfiedStep(step: VerificationStep, input: StepCompletionInput): boolean {
  switch (step) {
    case "person_kyc":
      return isApprovedStatus(input.personKycStatus);
    case "business_kyb":
      return isApprovedStatus(input.businessKybStatus);
    case "manual_upload":
      return input.manualStatus === "approved";
    case "manual_business_review":
      return isApprovedStatus(input.businessKybStatus);
    default:
      return false;
  }
}

/** True when the plan still requires business KYB or manual business review. */
export function planRequiresBusinessVerification(plan: VerificationPlan): boolean {
  return (
    plan.required_steps.includes("business_kyb") ||
    plan.required_steps.includes("manual_business_review")
  );
}

/** Whether all required steps in the plan are complete. */
export function isVerificationPlanComplete(
  plan: VerificationPlan,
  input: StepCompletionInput,
): boolean {
  if (plan.required_steps.length === 0) return true;
  return plan.required_steps.every((step) => isSatisfiedStep(step, input));
}

/** Count completed required steps for progress UI. */
export function verificationPlanProgress(
  plan: VerificationPlan,
  input: StepCompletionInput,
): { completed: number; total: number } {
  const total = plan.required_steps.length;
  const completed = plan.required_steps.filter((s) => isSatisfiedStep(s, input)).length;
  return { completed, total };
}

/** Step labels for provider-facing UI (no KYC/KYB jargon). */
export const VERIFICATION_STEP_LABELS: Record<
  VerificationStep,
  { title: string; description: string }
> = {
  person_kyc: {
    title: "Verify your identity",
    description: "Confirm you are who you say you are using your ID.",
  },
  business_kyb: {
    title: "Verify your business",
    description: "Confirm your registered company details.",
  },
  manual_upload: {
    title: "Upload identity documents",
    description: "Submit ID documents for our team to review.",
  },
  manual_business_review: {
    title: "Business document review",
    description: "Submit company registration documents for manual review.",
  },
};
