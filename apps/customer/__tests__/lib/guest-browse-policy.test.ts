import {
  classifyGuestPath,
  requiresCustomerLogin,
  requiresOnboardingBeforeAccess,
  toAppReturnTo,
} from "@/lib/guest-browse-policy";

describe("guest-browse-policy", () => {
  it("classifies browse routes without login", () => {
    expect(classifyGuestPath("/(app)/(tabs)/home")).toBe("browse");
    expect(classifyGuestPath("/(app)/(tabs)/search")).toBe("browse");
    expect(classifyGuestPath("/(app)/partner-profile")).toBe("browse");
    expect(classifyGuestPath("/(app)/product-detail")).toBe("browse");
    expect(requiresCustomerLogin("/(app)/(tabs)/explore")).toBe(false);
  });

  it("classifies account tabs separately from account actions", () => {
    expect(classifyGuestPath("/(app)/(tabs)/bookings")).toBe("account_tab");
    expect(classifyGuestPath("/(app)/(tabs)/cart")).toBe("account_tab");
    expect(classifyGuestPath("/(app)/(tabs)/profile")).toBe("account_tab");
    expect(requiresCustomerLogin("/(app)/(tabs)/cart")).toBe(false);
  });

  it("requires login for checkout, book, and settings", () => {
    expect(requiresCustomerLogin("/(app)/book")).toBe(true);
    expect(requiresCustomerLogin("/(app)/book/l/salon-demo")).toBe(true);
    expect(requiresCustomerLogin("/(app)/(tabs)/shop/product-checkout")).toBe(true);
    expect(requiresCustomerLogin("/(app)/account-settings/preferences")).toBe(true);
    expect(requiresCustomerLogin("/(app)/chat")).toBe(true);
  });

  it("requires login for support ticket create and detail", () => {
    expect(requiresCustomerLogin("/(app)/(tabs)/support-tickets")).toBe(false);
    expect(requiresCustomerLogin("/(app)/(tabs)/support-tickets/new")).toBe(true);
    expect(requiresCustomerLogin("/(app)/(tabs)/support-tickets/ticket-123")).toBe(true);
  });

  it("requires onboarding before book, checkout, and cart actions", () => {
    expect(requiresOnboardingBeforeAccess("/(app)/book")).toBe(true);
    expect(requiresOnboardingBeforeAccess("/(app)/(tabs)/shop/product-checkout")).toBe(true);
    expect(requiresOnboardingBeforeAccess("/(app)/(tabs)/cart")).toBe(true);
    expect(requiresOnboardingBeforeAccess("/(app)/(tabs)/home")).toBe(false);
    expect(requiresOnboardingBeforeAccess("/(app)/partner-profile")).toBe(false);
  });

  it("normalizes return_to paths for login handoff", () => {
    expect(toAppReturnTo("/(tabs)/cart")).toBe("/(app)/(tabs)/cart");
    expect(toAppReturnTo("/(app)/(tabs)/home")).toBe("/(app)/(tabs)/home");
    expect(toAppReturnTo("/")).toBe("/(app)/(tabs)/home");
  });
});
