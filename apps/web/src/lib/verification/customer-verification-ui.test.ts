import {
  customerVerificationCheckoutBanner,
  customerVerificationSubtitle,
  verificationRequiredForCustomers,
} from "./customer-verification-ui";

describe("customer verification UI helpers", () => {
  it("detects required policy", () => {
    expect(verificationRequiredForCustomers({ required_for_customers: true } as never)).toBe(true);
    expect(verificationRequiredForCustomers({ required_for_customers: false } as never)).toBe(false);
  });

  it("shows required copy when enforcement is on", () => {
    expect(customerVerificationSubtitle(true)).toContain("Required");
    expect(customerVerificationCheckoutBanner(true)).toContain("first booking");
  });
});
