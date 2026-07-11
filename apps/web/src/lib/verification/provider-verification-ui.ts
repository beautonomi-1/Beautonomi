import type { SafeVerificationPolicy } from "@/lib/config/types";

export function verificationRequiredForProviders(
  policy: Pick<SafeVerificationPolicy, "required_for_providers"> | null | undefined,
): boolean {
  return policy?.required_for_providers === true;
}

export function canSkipProviderVerification(options: {
  required: boolean;
  status: string;
  /** When set, required providers can skip only if the full verification plan is complete. */
  planComplete?: boolean;
}): boolean {
  if (!options.required) return true;
  if (options.planComplete !== undefined) {
    return options.planComplete;
  }
  return (
    options.status === "approved" ||
    options.status === "in_progress" ||
    options.status === "pending"
  );
}

export function providerVerificationOnboardingBanner(required: boolean): string {
  return required
    ? "Identity verification is required before you can go live. Verify now to earn the Verified trust badge."
    : "Identity verification is optional and earns you the Verified badge. You can do it now or later from Settings.";
}
