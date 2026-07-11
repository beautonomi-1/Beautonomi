import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/server/feature-flags", () => ({
  isFeatureEnabledServer: vi.fn(),
}));

import { isFeatureEnabledServer } from "@/lib/server/feature-flags";
import { getTerminalCheckoutEligibility } from "@/lib/terminal/terminal-checkout-eligibility";
import { createTerminalOrderForProvider } from "@/lib/terminal/create-terminal-order";

const mockedFeatureFlag = vi.mocked(isFeatureEnabledServer);

function createMockSupabase(config: {
  subscription?: {
    id: string;
    status: string;
    plan: {
      id: string;
      name: string;
      features: Record<string, unknown>;
      is_free?: boolean;
    };
  } | null;
  bundleOrderCount?: number;
}) {
  const terminalOrdersQuery = {
    eq: function eq() {
      return this;
    },
    not: function not() {
      return this;
    },
    then(resolve: (value: { count: number }) => void) {
      resolve({ count: config.bundleOrderCount ?? 0 });
    },
  };

  return {
    from: (table: string) => {
      if (table === "provider_subscriptions") {
        return {
          select: () => ({
            eq: () => ({
              in: () => ({
                or: () => ({
                  order: () => ({
                    maybeSingle: async () => ({ data: config.subscription ?? null }),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "terminal_orders") {
        return {
          select: () => terminalOrdersQuery,
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  } as never;
}

const baseProduct = {
  id: "prod-1",
  vendor: "paycloud",
  product_code: "PAYCLOUD_SMART_POS",
  sku: "BN-PAYCLOUD-01",
  upfront_price: 2499,
  monthly_price: 99,
  rental_price: 299,
  subscription_plan_eligible: true,
  currency: "ZAR",
};

describe("getTerminalCheckoutEligibility (Option C)", () => {
  beforeEach(() => {
    mockedFeatureFlag.mockReset();
    mockedFeatureFlag.mockResolvedValue(true);
  });

  it("offers buy only when bundle is not enabled, even with rental_price set", async () => {
    const supabase = createMockSupabase({ subscription: null });
    const result = await getTerminalCheckoutEligibility(supabase, "provider-1", baseProduct, "tenant-1");

    expect(result.options.map((o) => o.commercial_model)).toEqual(["once_off_purchase"]);
    expect(result.options.some((o) => o.commercial_model === "rental")).toBe(false);
  });

  it("offers buy and included-with-plan when bundle entitlement is enabled", async () => {
    const supabase = createMockSupabase({
      subscription: {
        id: "sub-1",
        status: "active",
        plan: {
          id: "plan-pro",
          name: "Pro",
          features: {
            terminal_bundle: {
              enabled: true,
              included_terminal_count: 1,
              terminal_model: "paycloud",
            },
          },
        },
      },
      bundleOrderCount: 0,
    });

    const result = await getTerminalCheckoutEligibility(supabase, "provider-1", baseProduct, "tenant-1");

    expect(result.options.map((o) => o.commercial_model)).toEqual([
      "once_off_purchase",
      "subscription_bundle",
    ]);
    expect(result.options.some((o) => o.commercial_model === "rental")).toBe(false);
  });

  it("never offers rental when only monthly_price is set", async () => {
    const supabase = createMockSupabase({ subscription: null });
    const result = await getTerminalCheckoutEligibility(
      supabase,
      "provider-1",
      {
        ...baseProduct,
        upfront_price: null,
        rental_price: null,
        monthly_price: 199,
      },
      "tenant-1",
    );

    expect(result.options).toEqual([]);
  });
});

describe("createTerminalOrderForProvider rental guard", () => {
  it("rejects rental commercial model before product lookup", async () => {
    await expect(
      createTerminalOrderForProvider({} as never, "provider-1", null, {
        product_id: "prod-1",
        commercial_model: "rental",
      }),
    ).rejects.toThrow(/no longer offered/i);
  });
});
