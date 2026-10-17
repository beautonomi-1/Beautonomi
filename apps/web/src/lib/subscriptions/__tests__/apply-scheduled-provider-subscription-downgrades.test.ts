import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateSubscription = vi.fn();
const mockDisableSubscriptionByCode = vi.fn();
const mockFetchSubscription = vi.fn();
const mockResolveTenantIdForFinanceLedger = vi.fn();

vi.mock("@/lib/payments/paystack-complete", () => ({
  createSubscription: (...args: unknown[]) => mockCreateSubscription(...args),
  disableSubscriptionByCode: (...args: unknown[]) => mockDisableSubscriptionByCode(...args),
  fetchSubscription: (...args: unknown[]) => mockFetchSubscription(...args),
}));

type Row = Record<string, unknown>;

function buildSupabase(rows: Row[], planCodes: Row | null) {
  const updates: Array<{ id: string; patch: Row }> = [];
  const client = {
    from: (table: string) => {
      if (table === "provider_subscriptions") {
        return {
          select: () => ({
            not: () => ({
              not: () => ({
                lte: () => ({ in: async () => ({ data: rows }) }),
              }),
            }),
          }),
          update: (patch: Row) => ({
            eq: (_col: string, id: string) => {
              updates.push({ id, patch });
              return Promise.resolve({ error: null });
            },
          }),
        };
      }
      if (table === "subscription_plans") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: planCodes }) }) }),
        };
      }
      throw new Error(`unexpected ${table}`);
    },
  };
  return { client, updates };
}

const baseRow = {
  id: "row",
  provider_id: "prov",
  tenant_id: "tenant-1",
  plan_id: "plan-pro",
  scheduled_plan_id: "plan-basic",
  scheduled_change_at: "2026-01-01T00:00:00.000Z",
  scheduled_billing_period: "monthly",
  billing_period: "monthly",
  paystack_authorization_code: "AUTH_x",
  paystack_customer_code: "CUS_x",
  paystack_subscription_code: "SUB_old",
};

vi.mock("@/lib/finance/resolve-tenant-id-for-ledger", () => ({
  resolveTenantIdForFinanceLedger: (...args: unknown[]) =>
    mockResolveTenantIdForFinanceLedger(...args),
}));

describe("applyScheduledProviderSubscriptionDowngrades", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveTenantIdForFinanceLedger.mockResolvedValue("tenant-1");
    mockDisableSubscriptionByCode.mockResolvedValue(undefined);
  });

  it("creates cheaper Paystack subscription and clears scheduled fields on success", async () => {
    mockCreateSubscription.mockResolvedValue({
      data: { subscription_code: "SUB_new", next_payment_date: "2026-02-01" },
    });

    const updates: unknown[] = [];
    const supabase = {
      from: (table: string) => {
        if (table === "provider_subscriptions") {
          return {
            select: () => ({
              not: () => ({
                not: () => ({
                  lte: () => ({
                    in: vi.fn().mockResolvedValue({
                      data: [
                        {
                          id: "sub-row-1",
                          provider_id: "prov-1",
                          tenant_id: "tenant-1",
                          plan_id: "plan-pro",
                          scheduled_plan_id: "plan-basic",
                          scheduled_change_at: "2026-01-01T00:00:00.000Z",
                          scheduled_billing_period: "monthly",
                          billing_period: "monthly",
                          paystack_authorization_code: "AUTH_x",
                          paystack_customer_code: "CUS_x",
                          paystack_subscription_code: "SUB_old",
                        },
                      ],
                    }),
                  }),
                }),
              }),
            }),
            update: (patch: unknown) => ({
              eq: (_col: string, id: string) => {
                updates.push({ id, patch });
                return Promise.resolve({ error: null });
              },
            }),
          };
        }
        if (table === "subscription_plans") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: "plan-basic",
                    paystack_plan_code_monthly: "PLAN_basic_m",
                  },
                }),
              }),
            }),
          };
        }
        throw new Error(`unexpected ${table}`);
      },
    };

    const { applyScheduledProviderSubscriptionDowngrades } = await import(
      "../apply-scheduled-provider-subscription-downgrades"
    );
    const expirePatch = () => ({ status: "expired" as const });
    const result = await applyScheduledProviderSubscriptionDowngrades(
      supabase as never,
      "2026-01-02T00:00:00.000Z",
      expirePatch,
    );

    expect(result.downgradesApplied).toBe(1);
    expect(mockDisableSubscriptionByCode).toHaveBeenCalledWith("SUB_old", { tenantId: "tenant-1" });
    expect(mockCreateSubscription).toHaveBeenCalled();
    const successUpdate = updates.find(
      (u) => (u as { patch: { plan_id?: string } }).patch?.plan_id === "plan-basic",
    ) as { patch: Record<string, unknown> };
    expect(successUpdate?.patch.scheduled_plan_id).toBeNull();
    expect(successUpdate?.patch.paystack_subscription_code).toBe("SUB_new");
  });

  it("expires to free when createSubscription fails", async () => {
    mockCreateSubscription.mockRejectedValue(new Error("charge failed"));

    const updates: unknown[] = [];
    const supabase = {
      from: (table: string) => {
        if (table === "provider_subscriptions") {
          return {
            select: () => ({
              not: () => ({
                not: () => ({
                  lte: () => ({
                    in: vi.fn().mockResolvedValue({
                      data: [
                        {
                          id: "sub-row-2",
                          provider_id: "prov-2",
                          tenant_id: "tenant-1",
                          plan_id: "plan-pro",
                          scheduled_plan_id: "plan-basic",
                          scheduled_change_at: "2026-01-01T00:00:00.000Z",
                          scheduled_billing_period: "monthly",
                          billing_period: "monthly",
                          paystack_authorization_code: "AUTH_x",
                          paystack_customer_code: "CUS_x",
                          paystack_subscription_code: "SUB_old",
                        },
                      ],
                    }),
                  }),
                }),
              }),
            }),
            update: (patch: unknown) => ({
              eq: () => {
                updates.push(patch);
                return Promise.resolve({ error: null });
              },
            }),
          };
        }
        if (table === "subscription_plans") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { paystack_plan_code_monthly: "PLAN_basic_m" },
                }),
              }),
            }),
          };
        }
        throw new Error(`unexpected ${table}`);
      },
    };

    const { applyScheduledProviderSubscriptionDowngrades } = await import(
      "../apply-scheduled-provider-subscription-downgrades"
    );
    const result = await applyScheduledProviderSubscriptionDowngrades(
      supabase as never,
      "2026-01-02T00:00:00.000Z",
      () => ({ status: "expired", plan_id: "free-plan" }),
    );

    expect(result.downgradesApplied).toBe(0);
    expect(result.expiredFromFailed).toEqual([{ id: "sub-row-2", provider_id: "prov-2" }]);
    expect(updates.some((p) => (p as { status?: string }).status === "expired")).toBe(true);
  });

  it("legacy row: skips (retries next run) when the old sub is still live and cannot be disabled", async () => {
    mockDisableSubscriptionByCode.mockRejectedValue(new Error("paystack down"));
    mockFetchSubscription.mockResolvedValue({ data: { status: "active" } });
    const { client, updates } = buildSupabase([baseRow], { paystack_plan_code_monthly: "PLN_b" });

    const { applyScheduledProviderSubscriptionDowngrades } = await import(
      "../apply-scheduled-provider-subscription-downgrades"
    );
    const result = await applyScheduledProviderSubscriptionDowngrades(
      client as never,
      "2026-01-02T00:00:00.000Z",
      () => ({ status: "expired" }),
    );

    expect(mockCreateSubscription).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
    expect(result.downgradesApplied).toBe(0);
    expect(result.expiredFromFailed).toEqual([]);
  });

  it("old code already disabled at schedule time: proceeds to create the cheaper sub", async () => {
    mockDisableSubscriptionByCode.mockRejectedValue(new Error("already inactive"));
    mockFetchSubscription.mockResolvedValue({ data: { status: "non-renewing" } });
    mockCreateSubscription.mockResolvedValue({ data: { subscription_code: "SUB_new" } });
    const { client, updates } = buildSupabase([baseRow], { paystack_plan_code_monthly: "PLN_b" });

    const { applyScheduledProviderSubscriptionDowngrades } = await import(
      "../apply-scheduled-provider-subscription-downgrades"
    );
    const result = await applyScheduledProviderSubscriptionDowngrades(
      client as never,
      "2026-01-02T00:00:00.000Z",
      () => ({ status: "expired" }),
    );

    expect(mockCreateSubscription).toHaveBeenCalledWith(
      { customer: "CUS_x", plan: "PLN_b", authorization: "AUTH_x" },
      { tenantId: "tenant-1" },
    );
    expect(result.downgradesApplied).toBe(1);
    expect(updates[0].patch).toMatchObject({ plan_id: "plan-basic", paystack_subscription_code: "SUB_new" });
  });

  it("card on file but target plan has no Paystack code: falls back to free and notifies", async () => {
    const { client, updates } = buildSupabase([baseRow], { paystack_plan_code_monthly: null });

    const { applyScheduledProviderSubscriptionDowngrades } = await import(
      "../apply-scheduled-provider-subscription-downgrades"
    );
    const result = await applyScheduledProviderSubscriptionDowngrades(
      client as never,
      "2026-01-02T00:00:00.000Z",
      () => ({ status: "expired", plan_id: "free" }),
    );

    expect(mockCreateSubscription).not.toHaveBeenCalled();
    expect(result.expiredFromFailed).toEqual([{ id: "row", provider_id: "prov" }]);
    expect(updates[0].patch).toMatchObject({ status: "expired", scheduled_plan_id: null });
  });

  it("no saved Paystack card (Stripe/Flutterwave/legacy): swaps plan_id only", async () => {
    const { client, updates } = buildSupabase(
      [{ ...baseRow, paystack_authorization_code: null, paystack_subscription_code: null }],
      { paystack_plan_code_monthly: "PLN_b" },
    );

    const { applyScheduledProviderSubscriptionDowngrades } = await import(
      "../apply-scheduled-provider-subscription-downgrades"
    );
    const result = await applyScheduledProviderSubscriptionDowngrades(
      client as never,
      "2026-01-02T00:00:00.000Z",
      () => ({ status: "expired" }),
    );

    expect(mockDisableSubscriptionByCode).not.toHaveBeenCalled();
    expect(mockCreateSubscription).not.toHaveBeenCalled();
    expect(result.downgradesApplied).toBe(1);
    expect(updates[0].patch).toMatchObject({ plan_id: "plan-basic", scheduled_plan_id: null });
    expect(updates[0].patch).not.toHaveProperty("status");
  });
});
