import { finalizeOnboardingSuccess, resolveCheckoutFlagsForRecovery, probeProviderProfileExists } from "@/features/provider-onboarding/finalize-onboarding";

const mockReplace = jest.fn();
const mockRefresh = jest.fn().mockResolvedValue(undefined);
const mockAlert = jest.fn();

jest.mock("react-native", () => ({
  Alert: { alert: (...args: unknown[]) => mockAlert(...args) },
}));

jest.mock("@/lib/api-client", () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

jest.mock("@react-native-async-storage/async-storage", () => ({
  removeItem: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/portal-cache", () => ({
  clearPortalCache: jest.fn(),
  setCachedPortal: jest.fn(),
}));

jest.mock("@/config/public-env", () => ({
  getBackendUrl: jest.fn(() => "https://api.example.com"),
}));

describe("finalizeOnboardingSuccess", () => {
  const { api } = jest.requireMock<{ api: { get: jest.Mock } }>("@/lib/api-client");

  beforeEach(() => {
    jest.clearAllMocks();
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

  it("returns true when profile id is present", async () => {
    api.get.mockResolvedValueOnce({ data: { id: "provider-1" }, error: null });
    await expect(probeProviderProfileExists()).resolves.toBe(true);
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
