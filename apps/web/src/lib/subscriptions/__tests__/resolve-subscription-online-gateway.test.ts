import { describe, expect, it, vi, beforeEach } from "vitest";

const mockGetPaymentProviderForTenant = vi.fn();

vi.mock("@/lib/payments/provider/registry", () => ({
  getPaymentProviderForTenant: (...args: unknown[]) => mockGetPaymentProviderForTenant(...args),
}));

describe("resolveSubscriptionOnlineGatewayId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns stripe when tenant primary gateway is Stripe", async () => {
    mockGetPaymentProviderForTenant.mockResolvedValue({
      provider: { id: "stripe" },
      gateway: { gateway: "stripe" },
    });
    const { resolveSubscriptionOnlineGatewayId } = await import(
      "../resolve-subscription-online-gateway"
    );
    await expect(resolveSubscriptionOnlineGatewayId("tenant-1")).resolves.toBe("stripe");
  });

  it("returns paystack when tenant primary gateway is Paystack", async () => {
    mockGetPaymentProviderForTenant.mockResolvedValue({
      provider: { id: "paystack" },
      gateway: { gateway: "paystack" },
    });
    const { resolveSubscriptionOnlineGatewayId, subscriptionGatewayUsesPaystackCustomer } =
      await import("../resolve-subscription-online-gateway");
    await expect(resolveSubscriptionOnlineGatewayId("tenant-1")).resolves.toBe("paystack");
    expect(subscriptionGatewayUsesPaystackCustomer("paystack")).toBe(true);
    expect(subscriptionGatewayUsesPaystackCustomer("stripe")).toBe(false);
  });
});
