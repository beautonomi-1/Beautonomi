import type { PublicConfigBundle } from "@/lib/config-bundle";

export type CustomerVerificationPolicySnapshot = {
  required_for_customers: boolean;
};

export const DEFAULT_VERIFICATION_POLICY: CustomerVerificationPolicySnapshot = {
  required_for_customers: false,
};

export function verificationPolicyFromBundle(
  bundle: PublicConfigBundle | null | undefined,
): CustomerVerificationPolicySnapshot {
  const v = bundle?.verification;
  return {
    required_for_customers: v?.required_for_customers === true,
  };
}

export function customerVerificationSubtitle(required: boolean): string {
  return required
    ? "Required before your first booking — verify with your government ID"
    : "Optional — verify for a trusted account anytime";
}

export function customerVerificationCheckoutBanner(required: boolean): string {
  return required
    ? "Identity verification is required before you can complete your first booking."
    : "Verify your identity for a trusted account. You can also do this later.";
}
