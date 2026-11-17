import { beforeEach, describe, expect, it, vi } from "vitest";

const { recordMembershipPayment, admin } = vi.hoisted(() => ({
  recordMembershipPayment: vi.fn(),
  admin: { from: vi.fn(), rpc: vi.fn() },
}));

vi.mock("@/lib/memberships/membership-payment", () => ({
  recordMembershipPayment: (...args: unknown[]) => recordMembershipPayment(...args),
}));

vi.mock("@/lib/regions/config", () => ({
  getTenantRegionConfig: async () => ({ defaultCurrency: "ZAR" }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => admin,
}));

import { createMembershipPurchase } from "../purchase-membership";

function supabaseFor(options: {
  existingOrderId?: string | null;
  priorOrders?: Array<{ id: string; status: string; amount?: number }>;
  savedPayment?: boolean;
  heldDebit?: boolean;
  rolledBack?: boolean;
}) {
  const steps: string[] = [];
  const orderUpdates: Array<Record<string, unknown>> = [];
  const credits: Array<Record<string, unknown>> = [];
  const inserts: string[] = [];
  admin.rpc.mockImplementation(async (_fn: string, args: Record<string, unknown>) => {
    credits.push(args);
    return { error: null };
  });
  admin.from.mockImplementation((table: string) => {
    if (table === "membership_plans") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  id: "plan-1",
                  provider_id: "provider-1",
                  price_monthly: 100,
                  currency: "ZAR",
                  is_active: true,
                },
                error: null,
              }),
            }),
          }),
        }),
      };
    }
    if (table === "providers") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { tenant_id: "tenant-1", status: "active" },
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === "membership_orders") {
      const list = {
        eq: () => list,
        order: () => list,
        limit: async () => ({ data: options.priorOrders ?? [], error: null }),
      };
      return {
        select: () => list,
        insert: () => ({
          select: () => ({
            single: async () => {
              inserts.push("order");
              return { data: { id: "order-1" }, error: null };
            },
          }),
        }),
        update: (values: Record<string, unknown>) => ({
          eq: async () => {
            orderUpdates.push(values);
            return { error: null };
          },
        }),
      };
    }
    if (table === "user_wallets") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: options.heldDebit ? { id: "wallet-1" } : null,
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === "wallet_transactions") {
      return {
        select: () => {
          const pairs: Array<[string, unknown]> = [];
          const api = {
            eq: (key: string, value: unknown) => {
              pairs.push([key, value]);
              return api;
            },
            maybeSingle: async () => {
              const key = pairs.find(([name]) => name === "idempotency_key")?.[1];
              if (typeof key === "string") {
                return { data: options.rolledBack ? { id: "rollback-1" } : null, error: null };
              }
              return {
                data: options.heldDebit ? { id: "debit-1" } : null,
                error: null,
              };
            },
          };
          return api;
        },
      };
    }
    if (table === "payment_transactions") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: options.savedPayment ? { id: "pay-1" } : null,
                  error: null,
                }),
              }),
            }),
          }),
        }),
      };
    }
    if (table === "user_memberships") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: options.existingOrderId
                  ? {
                      id: "um-1",
                      status: "active",
                      started_at: "2026-11-01T00:00:00.000Z",
                      expires_at: "2026-12-14T00:00:00.000Z",
                      metadata: { membership_order_id: options.existingOrderId },
                    }
                  : null,
                error: null,
              }),
            }),
          }),
        }),
        upsert: async () => {
          steps.push("membership");
          return { error: null };
        },
      };
    }
    throw new Error(`unexpected table: ${table}`);
  });
  return { steps, orderUpdates, credits, inserts };
}

const purchase = {
  userId: "user-1",
  userEmail: "c@example.com",
  planId: "plan-1",
  tenantId: "tenant-1",
  tender: "wallet" as const,
  authClient: {
    rpc: async () => ({ data: { balance: 50 }, error: null }),
  },
};

describe("wallet membership purchase", () => {
  beforeEach(() => {
    recordMembershipPayment.mockReset();
    admin.from.mockReset();
    admin.rpc.mockReset();
  });

  it("saves the payment before the membership month opens", async () => {
    const { steps, orderUpdates, credits } = supabaseFor({});
    recordMembershipPayment.mockImplementation(async () => {
      steps.push("payment");
      return { recorded: true, alreadyRecorded: false };
    });

    const result = await createMembershipPurchase(purchase);

    expect(result.status).toBe("paid");
    expect(steps).toEqual(["payment", "membership"]);
    expect(orderUpdates.some((row) => row.status === "paid")).toBe(true);
    expect(credits).toHaveLength(0);
  });

  it("returns the wallet amount and leaves the membership unchanged when the payment is not saved", async () => {
    const { steps, orderUpdates, credits } = supabaseFor({});
    recordMembershipPayment.mockImplementation(async () => {
      steps.push("payment");
      throw new Error("membership payment was not recorded");
    });

    await expect(createMembershipPurchase(purchase)).rejects.toThrow(
      "membership payment was not recorded",
    );
    expect(steps).toEqual(["payment"]);
    expect(credits[0]?.p_idempotency_key).toBe("wallet_membership_rollback:order-1");
    expect(credits[0]?.p_amount).toBe(100);
    expect(orderUpdates.some((row) => row.status === "failed")).toBe(true);
  });

  it("does not add another month when the same membership order is already open", async () => {
    const { steps } = supabaseFor({ existingOrderId: "order-1" });
    recordMembershipPayment.mockResolvedValue({ recorded: false, alreadyRecorded: true });

    const result = await createMembershipPurchase(purchase);

    expect(result.status).toBe("paid");
    expect(steps).toEqual([]);
  });

  it("opens the month for a wallet payment already saved without debiting again", async () => {
    const { steps, orderUpdates, inserts } = supabaseFor({
      priorOrders: [{ id: "order-saved", status: "pending" }],
      savedPayment: true,
    });
    const debits: unknown[] = [];

    const result = await createMembershipPurchase({
      ...purchase,
      authClient: {
        rpc: async (...args: unknown[]) => {
          debits.push(args);
          return { data: { balance: 50 }, error: null };
        },
      },
    });

    expect(result).toEqual({
      order_id: "order-saved",
      reference: "wallet_membership_order-saved",
      payment_url: null,
      status: "paid",
    });
    expect(debits).toHaveLength(0);
    expect(inserts).toHaveLength(0);
    expect(steps).toEqual(["membership"]);
    expect(orderUpdates.some((row) => row.status === "paid")).toBe(true);
    expect(recordMembershipPayment).not.toHaveBeenCalled();
  });

  it("does not add another month when that saved payment already opened the membership", async () => {
    const { steps, inserts } = supabaseFor({
      existingOrderId: "order-saved",
      priorOrders: [{ id: "order-saved", status: "pending" }],
      savedPayment: true,
    });
    const debits: unknown[] = [];

    const result = await createMembershipPurchase({
      ...purchase,
      authClient: {
        rpc: async (...args: unknown[]) => {
          debits.push(args);
          return { data: { balance: 50 }, error: null };
        },
      },
    });

    expect(result.order_id).toBe("order-saved");
    expect(debits).toHaveLength(0);
    expect(inserts).toHaveLength(0);
    expect(steps).toEqual([]);
  });

  it("saves the payment for a wallet debit already taken and does not debit again", async () => {
    const { steps, inserts } = supabaseFor({
      priorOrders: [{ id: "order-saved", status: "pending", amount: 100 }],
      heldDebit: true,
    });
    const debits: unknown[] = [];
    recordMembershipPayment.mockResolvedValue({ recorded: true, alreadyRecorded: false });

    const result = await createMembershipPurchase({
      ...purchase,
      authClient: {
        rpc: async (...args: unknown[]) => {
          debits.push(args);
          return { data: { balance: 50 }, error: null };
        },
      },
    });

    expect(result.order_id).toBe("order-saved");
    expect(debits).toHaveLength(0);
    expect(inserts).toHaveLength(0);
    expect(steps).toEqual(["membership"]);
    expect(recordMembershipPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        reference: "wallet_membership_order-saved",
        orderId: "order-saved",
        grossAmount: 100,
        paymentProvider: "wallet",
      }),
    );
  });

  it("debits again when the earlier wallet debit was already returned", async () => {
    const { inserts } = supabaseFor({
      priorOrders: [{ id: "order-saved", status: "pending", amount: 100 }],
      heldDebit: true,
      rolledBack: true,
    });
    const debits: unknown[] = [];
    recordMembershipPayment.mockResolvedValue({ recorded: true, alreadyRecorded: false });

    const result = await createMembershipPurchase({
      ...purchase,
      authClient: {
        rpc: async (...args: unknown[]) => {
          debits.push(args);
          return { data: { balance: 50 }, error: null };
        },
      },
    });

    expect(result.order_id).toBe("order-1");
    expect(debits).toHaveLength(1);
    expect(inserts).toEqual(["order"]);
    expect(recordMembershipPayment).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: "order-1", paymentProvider: "wallet" }),
    );
  });
});
