import {
  defaultBillingPeriod,
  resolveSubscriptionPlanIdForCheckout,
  startPaidSubscriptionCheckout,
} from "@/lib/subscription/start-paid-checkout";

jest.mock("@/lib/api-client", () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

const { api } = jest.requireMock<{ api: { get: jest.Mock; post: jest.Mock } }>("@/lib/api-client");

describe("defaultBillingPeriod", () => {
  it("prefers monthly when both are available", () => {
    expect(defaultBillingPeriod(["yearly", "monthly"])).toBe("monthly");
  });

  it("falls back to yearly when monthly is absent", () => {
    expect(defaultBillingPeriod(["yearly"])).toBe("yearly");
  });

  it("defaults to monthly when empty", () => {
    expect(defaultBillingPeriod([])).toBe("monthly");
  });
});

describe("startPaidSubscriptionCheckout", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns initialize-payment URL when upgrade requires payment", async () => {
    api.post
      .mockResolvedValueOnce({
        data: { requires_payment: true },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { authorization_url: "https://checkout.paystack.com/test" },
        error: null,
      });

    const result = await startPaidSubscriptionCheckout({
      subscriptionPlanId: "sub-plan-1",
      billingPeriod: "monthly",
    });

    expect(result).toEqual({
      ok: true,
      authorizationUrl: "https://checkout.paystack.com/test",
      orderId: undefined,
    });
    expect(api.post).toHaveBeenNthCalledWith(1, "/api/provider/subscription/upgrade", {
      plan_id: "sub-plan-1",
      billing_period: "monthly",
    });
    expect(api.post).toHaveBeenNthCalledWith(2, "/api/provider/subscription/initialize-payment", {
      plan_id: "sub-plan-1",
      billing_period: "monthly",
      in_app: true,
      callback_url: expect.stringMatching(/^https:\/\//),
    });
  });

  it("returns alreadyActive when upgrade succeeds without payment", async () => {
    api.post.mockResolvedValueOnce({
      data: { subscription_id: "ps-1", requires_payment: false },
      error: null,
    });

    const result = await startPaidSubscriptionCheckout({
      subscriptionPlanId: "sub-plan-1",
      billingPeriod: "yearly",
    });

    expect(result).toEqual({ ok: true, authorizationUrl: "", alreadyActive: true });
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it("surfaces upgrade API errors", async () => {
    api.post.mockResolvedValueOnce({
      data: null,
      error: { message: "Provider not found", code: "NOT_FOUND", status: 404 },
    });

    const result = await startPaidSubscriptionCheckout({
      subscriptionPlanId: "sub-plan-1",
      billingPeriod: "monthly",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Provider not found");
      expect(result.errorCode).toBe("NOT_FOUND");
    }
  });
});

describe("resolveSubscriptionPlanIdForCheckout", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("prefers selected_subscription_plan_id from completion payload", async () => {
    const id = await resolveSubscriptionPlanIdForCheckout({
      selectedSubscriptionPlanId: "sub-from-server",
      pricingPlanId: "pricing-card",
    });
    expect(id).toBe("sub-from-server");
    expect(api.get).not.toHaveBeenCalled();
  });

  it("falls back to pricing plan detail API", async () => {
    api.get.mockResolvedValueOnce({
      data: { subscription_plan_id: "sub-from-detail" },
      error: null,
    });

    const id = await resolveSubscriptionPlanIdForCheckout({
      pricingPlanId: "pricing-card",
    });

    expect(id).toBe("sub-from-detail");
    expect(api.get).toHaveBeenCalledWith("/api/public/pricing/plans/pricing-card");
  });
});
