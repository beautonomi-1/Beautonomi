import {
  customerVerificationSubtitle,
  verificationPolicyFromBundle,
} from "@/lib/verification/policy";
import type { PublicConfigBundle } from "@/lib/config-bundle";

describe("customer verification policy helpers", () => {
  it("reads required_for_customers from bundle", () => {
    const bundle = {
      verification: { required_for_customers: true },
    } as PublicConfigBundle;
    expect(verificationPolicyFromBundle(bundle)).toEqual({ required_for_customers: true });
    expect(verificationPolicyFromBundle(null)).toEqual({ required_for_customers: false });
  });

  it("uses required subtitle when enforcement is on", () => {
    expect(customerVerificationSubtitle(true)).toContain("Required");
    expect(customerVerificationSubtitle(false)).toContain("Optional");
  });
});
