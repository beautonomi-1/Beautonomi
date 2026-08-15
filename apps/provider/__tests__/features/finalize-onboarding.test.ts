import { finalizeOnboardingSuccess, resolveCheckoutFlagsForRecovery, probeProviderProfileExists } from "@/features/provider-onboarding/finalize-onboarding";

const mockReplace = jest.fn();
const mockRefresh = jest.fn().mockResolvedValue(undefined);
const mockAlert = jest.fn();

jest.mock("react-native", () => ({
  Alert: { alert: (...args: unknown[]) => mockAlert(...args) },
  // These cases assert the Paystack checkout path. `shouldUseAppleIap()` reads
  // Platform.OS, and iOS diverts to the App Store flow instead.
  Platform: { OS: "android", select: (specifics: Record<string, unknown>) => specifics.android },
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

const mockSetBiometricPromptPending = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/biometric-setup-prompt", () => ({
  setBiometricPromptPending: (...args: unknown[]) => mockSetBiometricPromptPending(...args),
}));

jest.mock("@/lib/payments/paystackRefFromUrl", () => ({
  extractPaystackReferenceFromUrl: jest.fn(() => "ref-test"),
}));

jest.mock("@/lib/payments/verifyPaystackWithRetry", () => ({
  verifyPaystackWithRetry: jest.fn().mockResolvedValue({ status: "success" }),
}));

jest.mock("@/lib/payments/providerPaystackReturn", () => ({
  getSubscriptionPaystackReturnUrl: jest.fn(() => "provider://subscription-return"),
  matchesSubscriptionPaystackReturnUrl: jest.fn((_url: string, opts?: { success?: boolean; cancelled?: boolean }) => {
    if (opts?.cancelled) return false;
    if (opts?.success) return true;
    return false;
  }),
  pollSubscriptionProvisioned: jest.fn().mockResolvedValue({ state: "provisioned" }),
}));

jest.mock("@/lib/subscription/start-paid-checkout", () => ({
  resolveSubscriptionPlanIdForCheckout: jest.fn().mockResolvedValue("subscription-plan-paid"),
  startPaidSubscriptionCheckout: jest.fn(),
}));

describe("finalizeOnboardingSuccess", () => {
  const { api } = jest.requireMock<{ api: { get: jest.Mock; post: jest.Mock } }>("@/lib/api-client");
  const { startPaidSubscriptionCheckout, resolveSubscriptionPlanIdForCheckout } =
    jest.requireMock<{
      startPaidSubscriptionCheckout: jest.Mock;
      resolveSubscriptionPlanIdForCheckout: jest.Mock;
    }>("@/lib/subscription/start-paid-checkout");

  beforeEach(() => {
    jest.clearAllMocks();
    mockSetBiometricPromptPending.mockClear();
    resolveSubscriptionPlanIdForCheckout.mockResolvedValue("subscription-plan-paid");
    api.get.mockResolvedValue({
      data: { portal: "provider", role: "provider_owner", provider_status: "active" },
      error: null,
    });
  });

  it("routes to verify-identity for free plan without checkout", async () => {
    await finalizeOnboardingSuccess({
      data: {
        selected_plan_id: "free-plan",
        selected_plan_is_free: true,
        requires_checkout: false,
      },
      formData: { selected_plan_name: "Free" },
      router: { replace: mockReplace } as never,
      refreshProvider: mockRefresh,
      userId: "user-1",
      showSuccessAlert: false,
    });

    expect(mockReplace).toHaveBeenCalledWith("/(app)/onboarding/verify-identity");
    expect(mockRefresh).toHaveBeenCalled();
    expect(mockSetBiometricPromptPending).toHaveBeenCalledWith("user-1");
  });

  it("opens in-app browser when requires_checkout is true", async () => {
    await finalizeOnboardingSuccess({
      data: {
        selected_plan_id: "paid-plan",
        requires_checkout: true,
        checkout_path: "/provider/subscription-checkout?planId=paid-plan",
      },
      formData: {},
      router: { replace: mockReplace } as never,
      refreshProvider: mockRefresh,
      userId: "user-1",
      showSuccessAlert: false,
    });

    expect(mockReplace).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: "/(app)/(tabs)/more/in-app-browser",
      }),
    );
    expect(mockSetBiometricPromptPending).toHaveBeenCalledWith("user-1");
  });

  it("uses upgrade + initialize-payment checkout when waitForCheckout is provided", async () => {
    const waitForCheckout = jest.fn().mockResolvedValue({
      outcome: "success",
      url: "https://app.test/provider/subscription?payment_success=true",
    });
    startPaidSubscriptionCheckout.mockResolvedValue({
      ok: true,
      authorizationUrl: "https://checkout.paystack.com/test",
      orderId: "order-1",
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

    expect(startPaidSubscriptionCheckout).toHaveBeenCalledWith({
      subscriptionPlanId: "subscription-plan-paid",
      billingPeriod: "monthly",
      inApp: true,
    });
    expect(waitForCheckout).toHaveBeenCalledWith(
      "https://checkout.paystack.com/test",
      expect.objectContaining({ returnUrl: "provider://subscription-return" }),
    );
    expect(mockReplace).toHaveBeenCalledWith("/(app)/onboarding/verify-identity");
  });

  it("verifies stored reference when auth session closes after checkout", async () => {
    const { verifyPaystackWithRetry } = jest.requireMock<{ verifyPaystackWithRetry: jest.Mock }>(
      "@/lib/payments/verifyPaystackWithRetry",
    );
    const waitForCheckout = jest.fn().mockResolvedValue({ outcome: "closed" });
    startPaidSubscriptionCheckout.mockResolvedValue({
      ok: true,
      authorizationUrl: "https://checkout.paystack.com/test",
      orderId: "order-1",
      reference: "provider_subscription_auth_test",
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

    expect(verifyPaystackWithRetry).toHaveBeenCalledWith("provider_subscription_auth_test");
    expect(mockReplace).toHaveBeenCalledWith("/(app)/onboarding/verify-identity");
  });

  it("sets portal cache to provider after free plan success", async () => {
    const { setCachedPortal } = jest.requireMock<{ setCachedPortal: jest.Mock }>("@/lib/portal-cache");

    await finalizeOnboardingSuccess({
      data: {
        selected_plan_id: "free-plan",
        selected_plan_is_free: true,
        requires_checkout: false,
      },
      formData: {},
      router: { replace: mockReplace } as never,
      refreshProvider: mockRefresh,
      userId: "user-portal",
      showSuccessAlert: false,
    });

    expect(setCachedPortal).toHaveBeenCalledWith("user-portal", "provider");
  });
});

describe("resolveCheckoutFlagsForRecovery — free plan timeout path", () => {
  const { api } = jest.requireMock<{ api: { get: jest.Mock } }>("@/lib/api-client");

  beforeEach(() => {
    api.get.mockReset();
  });

  it("returns requires_checkout false for free plan when subscription API fails", async () => {
    api.get
      .mockResolvedValueOnce({ data: null, error: { message: "none" } })
      .mockResolvedValueOnce({
        data: [{ id: "free-plan-id", is_free: true }],
        error: null,
      });

    const flags = await resolveCheckoutFlagsForRecovery({
      selected_plan_id: "free-plan-id",
      selected_plan_is_free: true,
    });

    expect(flags.requires_checkout).toBe(false);
    expect(flags.selected_plan_is_free).toBe(true);
  });
});

describe("probeProviderProfileExists", () => {
  const { api } = jest.requireMock<{ api: { get: jest.Mock } }>("@/lib/api-client");

  beforeEach(() => {
    api.get.mockReset();
  });

  it("returns true only when the user owns a business", async () => {
    api.get.mockResolvedValueOnce({
      data: {
        memberships: [
          { relationship: "staff" },
          { relationship: "owner" },
        ],
      },
      error: null,
    });
    await expect(probeProviderProfileExists()).resolves.toBe(true);
  });

  it("returns false for staff-only memberships so they can start their own business", async () => {
    api.get.mockResolvedValueOnce({
      data: { memberships: [{ relationship: "staff" }] },
      error: null,
    });
    await expect(probeProviderProfileExists()).resolves.toBe(false);
  });
});

describe("resolveCheckoutFlagsForRecovery", () => {
  const { api } = jest.requireMock<{ api: { get: jest.Mock } }>("@/lib/api-client");

  beforeEach(() => {
    api.get.mockReset();
  });

  it("returns requires_checkout false when active subscription exists", async () => {
    api.get.mockResolvedValueOnce({
      data: { subscription: { status: "active" }, is_free: true },
      error: null,
    });

    const flags = await resolveCheckoutFlagsForRecovery({ selected_plan_id: "any" });
    expect(flags.requires_checkout).toBe(false);
  });

  it("returns requires_checkout false for free pricing plan fallback", async () => {
    api.get
      .mockResolvedValueOnce({ data: null, error: { message: "none" } })
      .mockResolvedValueOnce({
        data: [{ id: "free-id", is_free: true }],
        error: null,
      });

    const flags = await resolveCheckoutFlagsForRecovery({ selected_plan_id: "free-id" });
    expect(flags.requires_checkout).toBe(false);
    expect(flags.selected_plan_is_free).toBe(true);
  });
});
