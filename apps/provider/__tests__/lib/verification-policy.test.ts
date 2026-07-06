import {
  canSkipProviderVerification,
  providerVerificationContinueLabel,
  providerVerificationSubtitle,
  verificationPolicyFromBundle,
} from "@/lib/verification/policy";
import type { PublicConfigBundle } from "@/lib/config-bundle";

describe("verification policy helpers", () => {
  it("reads required_for_providers from bundle", () => {
    const bundle = {
      verification: { required_for_providers: true, required_for_payouts: false },
    } as PublicConfigBundle;

    expect(verificationPolicyFromBundle(bundle)).toEqual({
      required_for_providers: true,
      required_for_payouts: false,
    });
    expect(verificationPolicyFromBundle(null)).toEqual({
      required_for_providers: false,
      required_for_payouts: false,
    });
  });

  it("uses required copy when enforcement is on", () => {
    expect(providerVerificationSubtitle(true)).toContain("Required");
    expect(providerVerificationSubtitle(false)).toContain("Optional");
  });

  it("blocks skip when required and not started", () => {
    expect(canSkipProviderVerification({ required: true, status: "not_started" })).toBe(false);
    expect(canSkipProviderVerification({ required: false, status: "not_started" })).toBe(true);
    expect(canSkipProviderVerification({ required: true, status: "approved" })).toBe(true);
    expect(canSkipProviderVerification({ required: true, status: "pending_review" })).toBe(true);
  });

  it("labels continue action based on requirement", () => {
    // Required + not started: the button is a hard gate, so the label must not
    // promise the user they can skip (canSkipProviderVerification returns false).
    expect(
      providerVerificationContinueLabel({ required: true, status: "not_started" }),
    ).toContain("required");
    expect(
      providerVerificationContinueLabel({ required: true, status: "in_progress" }),
    ).toContain("Continue");
    expect(
      providerVerificationContinueLabel({ required: false, status: "not_started" }),
    ).toContain("Do this later");
  });
});
