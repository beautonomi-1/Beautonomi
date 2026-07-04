import type { PublicConfigBundle } from "@/lib/config-bundle";

export type VerificationPolicySnapshot = {
  required_for_providers: boolean;
  required_for_payouts: boolean;
};

export const DEFAULT_VERIFICATION_POLICY: VerificationPolicySnapshot = {
  required_for_providers: false,
  required_for_payouts: false,
};

export function verificationPolicyFromBundle(
  bundle: PublicConfigBundle | null | undefined,
): VerificationPolicySnapshot {
  const v = bundle?.verification;
  return {
    required_for_providers: v?.required_for_providers === true,
    required_for_payouts: v?.required_for_payouts === true,
  };
}

/** Header / onboarding subtitle for provider identity verification. */
export function providerVerificationSubtitle(required: boolean): string {
  return required
    ? "Required to go live — verify for the Verified trust badge"
    : "Optional — earn the Verified trust badge anytime";
}

/** Whether the provider may skip verification and continue to the dashboard. */
export function canSkipProviderVerification(options: {
  required: boolean;
  status: string;
}): boolean {
  if (!options.required) return true;
  return (
    options.status === "approved" ||
    options.status === "pending_review" ||
    options.status === "in_progress"
  );
}

export function providerVerificationContinueLabel(options: {
  required: boolean;
  status: string;
}): string {
  if (options.status === "approved") return "Continue to dashboard";
  if (options.status === "pending_review") {
    return "Continue — we'll notify you when verified";
  }
  if (options.required) {
    return "I'll verify later — go to dashboard anyway";
  }
  return "Do this later — go to dashboard";
}
