import { finalizeOnboardingSuccess } from "@/features/provider-onboarding/finalize-onboarding";

const mockReplace = jest.fn();
const mockRefresh = jest.fn().mockResolvedValue(undefined);
const mockAlert = jest.fn();

jest.mock("react-native", () => ({
  Alert: { alert: (...args: unknown[]) => mockAlert(...args) },
  Platform: { OS: "ios", select: (specifics: Record<string, unknown>) => specifics.ios },
}));

jest.mock("@/lib/api-client", () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

jest.mock("@react-native-async-storage/async-storage", () => ({
  removeItem: jest.fn().mockResolvedValue(undefined),
  setItem: jest.fn().mockResolvedValue(undefined),
  getItem: jest.fn().mockResolvedValue(null),
}));

jest.mock("@/lib/portal-cache", () => ({
  clearPortalCache: jest.fn(),
  setCachedPortal: jest.fn(),
}));

jest.mock("@/config/public-env", () => ({
  getBackendUrl: jest.fn(() => "https://api.example.com"),
}));

jest.mock("@/lib/biometric-setup-prompt", () => ({
  setBiometricPromptPending: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/payments/paystackRefFromUrl", () => ({
  extractPaystackReferenceFromUrl: jest.fn(() => "ref-test"),
}));

jest.mock("@/lib/payments/verifyPaystackWithRetry", () => ({
  verifyPaystackWithRetry: jest.fn().mockResolvedValue({ status: "success" }),
}));

jest.mock("@/lib/payments/providerPaystackReturn", () => ({
  getSubscriptionPaystackReturnUrl: jest.fn(() => "provider://subscription-return"),
  matchesSubscriptionPaystackReturnUrl: jest.fn(),
  pollSubscriptionProvisioned: jest.fn().mockResolvedValue({ state: "provisioned" }),
}));

jest.mock("@/lib/subscription/start-paid-checkout", () => ({
  resolveSubscriptionPlanIdForCheckout: jest.fn().mockResolvedValue("subscription-plan-paid"),
  startPaidSubscriptionCheckout: jest.fn(),
}));

jest.mock("@/lib/subscription/start-apple-subscription-checkout", () => ({
  startAppleSubscriptionCheckout: jest.fn(),
}));

describe("finalizeOnboardingSuccess iOS IAP", () => {
  const { api } = jest.requireMock<{ api: { get: jest.Mock; post: jest.Mock } }>("@/lib/api-client");
  const { startPaidSubscriptionCheckout } = jest.requireMock<{
    startPaidSubscriptionCheckout: jest.Mock;
  }>("@/lib/subscription/start-paid-checkout");
  const { startAppleSubscriptionCheckout } = jest.requireMock<{
    startAppleSubscriptionCheckout: jest.Mock;
  }>("@/lib/subscription/start-apple-subscription-checkout");

  const waitForCheckout = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    api.get.mockImplementation(async (path: string) => {
      if (path.includes("/subscription/plans")) {
        return {
          data: [
            {
              plan_id: "subscription-plan-paid",
              billing_period: "monthly",
              apple_product_id: "com.beautonomi.partner.sub.growth.monthly",
            },
          ],
          error: null,
        };
      }
      if (path.includes("/provider/profile")) {
        return { data: { id: "provider-1" }, error: null };
      }
      return { data: { portal: "provider" }, error: null };
    });
  });

  it("uses StoreKit and never opens Paystack when the Apple product is mapped", async () => {
    startAppleSubscriptionCheckout.mockResolvedValue({ ok: true });

    await finalizeOnboardingSuccess({
      data: {
        provider: { id: "provider-1" },
        selected_plan_id: "paid-plan",
        selected_subscription_plan_id: "subscription-plan-paid",
        requires_checkout: true,
      },
      formData: { selected_billing_period: "monthly" },
      router: { replace: mockReplace } as never,
      refreshProvider: mockRefresh,
      userId: "user-1",
      showSuccessAlert: false,
      waitForCheckout,
    });

    expect(startAppleSubscriptionCheckout).toHaveBeenCalledWith({
      subscriptionPlanId: "subscription-plan-paid",
      billingPeriod: "monthly",
      appleProductId: "com.beautonomi.partner.sub.growth.monthly",
      providerId: "provider-1",
    });
    expect(startPaidSubscriptionCheckout).not.toHaveBeenCalled();
    expect(waitForCheckout).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith("/(app)/onboarding/verify-identity");
  });

  it("fails closed instead of opening Paystack when the Apple product is missing", async () => {
    api.get.mockImplementation(async (path: string) => {
      if (path.includes("/subscription/plans")) {
        return {
          data: [{ plan_id: "subscription-plan-paid", billing_period: "monthly" }],
          error: null,
        };
      }
      if (path.includes("/provider/profile")) {
        return { data: { id: "provider-1" }, error: null };
      }
      return { data: { portal: "provider" }, error: null };
    });

    await finalizeOnboardingSuccess({
      data: {
        selected_plan_id: "paid-plan",
        selected_subscription_plan_id: "subscription-plan-paid",
        requires_checkout: true,
      },
      formData: { selected_billing_period: "monthly" },
      router: { replace: mockReplace } as never,
      refreshProvider: mockRefresh,
      userId: "user-1",
      showSuccessAlert: false,
      waitForCheckout,
    });

    expect(startPaidSubscriptionCheckout).not.toHaveBeenCalled();
    expect(startAppleSubscriptionCheckout).not.toHaveBeenCalled();
    expect(mockAlert).toHaveBeenCalledWith(
      "Checkout failed",
      expect.stringMatching(/App Store purchase/),
      expect.any(Array),
    );
  });
});
