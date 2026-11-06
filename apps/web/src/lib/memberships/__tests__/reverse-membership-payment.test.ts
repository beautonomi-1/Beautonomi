import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/finance/resolve-tenant-id-for-ledger", () => ({
  resolveTenantIdForFinanceLedger: vi.fn(async () => "tenant-1"),
}));

type Row = {
  transaction_type: string;
  refund_component?: string | null;
  amount: number;
  net?: number;
  fees?: number;
  metadata?: Record<string, unknown>;
};

function mockClient(input: { earnNet: number; gross: number; fees: number; prior?: Row[] }) {
  const ledger: Row[] = [
    {
      transaction_type: "membership_provider_earnings",
      amount: input.earnNet,
      net: input.earnNet,
      fees: input.fees,
      metadata: { membership_order_id: "mo-1" },
    },
    {
      transaction_type: "membership_sale",
      amount: input.gross,
      fees: input.fees,
      metadata: { membership_order_id: "mo-1" },
    },
    ...(input.prior ?? []),
  ];
  const inserted: Row[] = [];
  const membershipUpdates: unknown[] = [];

  const query = () => {
    const filters: Array<(r: Row) => boolean> = [];
    const builder = {
      select: () => builder,
      eq: (key: string, value: unknown) => {
        filters.push((r) => key === "provider_id" || (r as Record<string, unknown>)[key] === value);
        return builder;
      },
      in: (key: string, values: unknown[]) => {
        filters.push((r) => values.includes((r as Record<string, unknown>)[key]));
        return builder;
      },
      contains: () => builder,
      limit: () => builder,
      then: (resolve: (v: { data: Row[]; error: null }) => unknown) =>
        resolve({ data: ledger.filter((r) => filters.every((f) => f(r))), error: null }),
      insert: async (rows: Row[]) => {
        inserted.push(...rows);
        ledger.push(...rows);
        return { error: null };
      },
    };
    return builder;
  };

  const client = {
    from(table: string) {
      if (table === "finance_transactions") return query();
      if (table === "user_memberships") {
        return {
          update(patch: unknown) {
            return {
              eq: () => ({
                eq: () => ({
                  in: async () => {
                    membershipUpdates.push(patch);
                    return { error: null };
                  },
                }),
              }),
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };

  return { client, inserted, membershipUpdates };
}

const base = { membershipOrderId: "mo-1", providerId: "prov-1", userId: "user-1" };

describe("reverseMembershipPayment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reverses the full provider net and cancels the membership", async () => {
    const { reverseMembershipPayment } = await import("../reverse-membership-payment");
    const { client, inserted, membershipUpdates } = mockClient({ earnNet: 97, gross: 100, fees: 3 });

    const result = await reverseMembershipPayment({
      supabase: client as never,
      ...base,
      refundAmountMajor: 100,
      reference: "rf-1",
    });

    expect(inserted.find((r) => r.refund_component === "membership_provider_earnings")?.net).toBe(-97);
    expect(inserted.find((r) => r.refund_component === "membership_sale")?.net).toBe(-100);
    expect(result.fullyReversed).toBe(true);
    expect(result.membershipCancelled).toBe(true);
    expect(membershipUpdates).toHaveLength(1);
  });

  it("pro-rates a partial refund and leaves the membership active", async () => {
    const { reverseMembershipPayment } = await import("../reverse-membership-payment");
    const { client, inserted, membershipUpdates } = mockClient({ earnNet: 97, gross: 100, fees: 3 });

    const result = await reverseMembershipPayment({
      supabase: client as never,
      ...base,
      refundAmountMajor: 40,
      reference: "rf-1",
    });

    expect(inserted.find((r) => r.refund_component === "membership_provider_earnings")?.net).toBe(-38.8);
    expect(inserted.find((r) => r.refund_component === "membership_sale")?.net).toBe(-40);
    expect(result.fullyReversed).toBe(false);
    expect(membershipUpdates).toHaveLength(0);
  });

  it("ignores a retry of the same refund", async () => {
    const { reverseMembershipPayment } = await import("../reverse-membership-payment");
    const { client, inserted } = mockClient({ earnNet: 97, gross: 100, fees: 3 });

    await reverseMembershipPayment({ supabase: client as never, ...base, refundAmountMajor: 40, reference: "rf-1" });
    const retry = await reverseMembershipPayment({
      supabase: client as never,
      ...base,
      refundAmountMajor: 40,
      reference: "rf-1",
    });

    expect(retry.alreadyReversed).toBe(true);
    expect(inserted).toHaveLength(2);
  });

  it("caps a second partial refund at what is left and cancels when fully reversed", async () => {
    const { reverseMembershipPayment } = await import("../reverse-membership-payment");
    const { client, inserted, membershipUpdates } = mockClient({ earnNet: 97, gross: 100, fees: 3 });

    await reverseMembershipPayment({ supabase: client as never, ...base, refundAmountMajor: 70, reference: "rf-1" });
    const second = await reverseMembershipPayment({
      supabase: client as never,
      ...base,
      refundAmountMajor: 70,
      reference: "rf-2",
    });

    const providerTotal = inserted
      .filter((r) => r.refund_component === "membership_provider_earnings")
      .reduce((s, r) => s + r.amount, 0);
    const saleTotal = inserted
      .filter((r) => r.refund_component === "membership_sale")
      .reduce((s, r) => s + r.amount, 0);
    expect(Math.round(providerTotal * 100) / 100).toBe(97);
    expect(Math.round(saleTotal * 100) / 100).toBe(100);
    expect(second.fullyReversed).toBe(true);
    expect(membershipUpdates).toHaveLength(1);
  });
});
