import type { SafeVerificationPolicy } from "@/lib/config/types";

export function verificationRequiredForCustomers(
  policy: Pick<SafeVerificationPolicy, "required_for_customers"> | null | undefined,
): boolean {
  return policy?.required_for_customers === true;
}

export function customerVerificationSubtitle(required: boolean): string {
  return required
    ? "Required before your first booking — verify with your government ID or passport."
    : "Optional — verify with your government ID or passport for a trusted account.";
}

export function customerVerificationCheckoutBanner(required: boolean): string {
  return required
    ? "Identity verification is required before you can complete your first booking. Verify now to continue checkout."
    : "Verify your identity for a trusted account. You can also do this later from Account settings.";
}
