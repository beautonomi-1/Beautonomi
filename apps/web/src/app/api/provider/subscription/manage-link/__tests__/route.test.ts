import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockGetProviderIdForUser = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockGetSubscriptionManageLink = vi.fn();
const mockCreateStripePortal = vi.fn();
const mockAppleBlock = vi.fn();

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
    getProviderIdForUser: (...args: unknown[]) => mockGetProviderIdForUser(...args),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: (...args: unknown[]) => mockGetSupabaseServer(...args),
}));

vi.mock("@/lib/tenant/resolve-tenant-from-db", () => ({
  resolveTenantIdWithZaFallback: vi.fn().mockResolvedValue("tenant-uk"),
}));

vi.mock("@/lib/iap/apple/ios-eligibility", () => ({
  getAppleBillingPaystackBlock: (...args: unknown[]) => mockAppleBlock(...args),
}));

vi.mock("@/lib/payments/paystack-complete", () => ({
  getSubscriptionManageLink: (...args: unknown[]) => mockGetSubscriptionManageLink(...args),
}));

vi.mock("@/lib/payments/stripe-billing-portal", () => ({
  createProviderStripeBillingPortalUrl: (...args: unknown[]) =>
    mockCreateStripePortal(...args),
}));

function supabaseWithSubscription(sub: Record<string, unknown>) {
  return {
    from: (table: string) => {
      if (table === "provider_subscriptions") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: sub, error: null }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };
}

describe("GET /api/provider/subscription/manage-link", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = "https://app.test";
    mockRequireRoleInApi.mockResolvedValue({
      user: { id: "user-1", role: "provider_owner" },
    });
    mockGetProviderIdForUser.mockResolvedValue("provider-1");
    mockAppleBlock.mockResolvedValue({ blocked: false });
  });

  it("returns Stripe Customer Portal URL when billing_provider is stripe", async () => {
    mockGetSupabaseServer.mockResolvedValue(
      supabaseWithSubscription({
        id: "sub-1",
        billing_provider: "stripe",
        stripe_customer_id: "cus_stripe_1",
      }),
    );
    mockCreateStripePortal.mockResolvedValue("https://billing.stripe.test/session");

    const { GET } = await import("../route");
    const res = await GET(new NextRequest("http://localhost/api/provider/subscription/manage-link"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data?.link).toBe("https://billing.stripe.test/session");
    expect(json.data?.provider).toBe("stripe");
    expect(mockGetSubscriptionManageLink).not.toHaveBeenCalled();
  });

  it("returns Paystack manage link when paystack_subscription_code is set", async () => {
    mockGetSupabaseServer.mockResolvedValue(
      supabaseWithSubscription({
        id: "sub-1",
        billing_provider: "paystack",
        paystack_subscription_code: "SUB_abc",
      }),
    );
    mockGetSubscriptionManageLink.mockResolvedValue({
      status: true,
      data: { link: "https://paystack.test/manage" },
    });

    const { GET } = await import("../route");
    const res = await GET(new NextRequest("http://localhost/api/provider/subscription/manage-link"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data?.link).toBe("https://paystack.test/manage");
    expect(json.data?.provider).toBe("paystack");
  });
});
