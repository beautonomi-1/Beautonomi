import { describe, expect, it } from "vitest";
import { renewalPeriodEnd } from "../membership-renewal-retry";
import {
  resumeUnopenedMembershipRenewal,
  stampOpenedMembershipOrders,
} from "../resume-unopened-membership-renewal";

function supabaseFor(options: {
  orders?: Array<{ id: string; status?: string; payment?: boolean }>;
  termError?: boolean;
  openMonths?: Array<{ orderId: string; expiresAt: string; nextBillingAt: string | null }>;
}) {
  const updates: Array<{ table: string; values: Record<string, unknown>; id?: string }> = [];
  const orders = options.orders ?? [];
  const supabase = {
    from(table: string) {
      if (table === "membership_orders") {
        const list = {
          eq: () => list,
          contains: () => list,
          in: () => list,
          order: () => list,
          limit: async () => ({
            data: orders.map((order) => ({ id: order.id, status: order.status ?? "paid" })),
            error: null,
          }),
          update: (values: Record<string, unknown>) => ({
            eq: async (_key: string, id: string) => {
              updates.push({ table, values, id });
              return { error: null };
            },
          }),
        };
        return {
          select: () => list,
          update: list.update,
        };
      }
      if (table === "payment_transactions") {
        let orderId: string | null = null;
        const list = {
          eq: () => list,
          contains: (_column: string, value: { membership_order_id?: string }) => {
            orderId = value?.membership_order_id ?? null;
            return list;
          },
          limit: async () => ({
            data: orders.some((order) => order.id === orderId && order.payment)
              ? [{ id: "pay-1", reference: "mem_renew_1" }]
              : [],
            error: null,
          }),
        };
        return { select: () => list };
      }
      if (table === "user_memberships") {
        return {
          select: () => {
            let orderId: string | null = null;
            const list = {
              contains: (_column: string, value: { membership_order_id?: string }) => {
                orderId = value?.membership_order_id ?? null;
                return list;
              },
              limit: async () => {
                const open = (options.openMonths ?? []).find((month) => month.orderId === orderId);
                return {
                  data: open
                    ? [{ id: "um-1", expires_at: open.expiresAt, next_billing_at: open.nextBillingAt }]
                    : [],
                  error: null,
                };
              },
            };
            return list;
          },
          update: (values: Record<string, unknown>) => ({
            eq: async () => {
              updates.push({ table, values });
              return { error: options.termError ? { message: "term down" } : null };
            },
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
  return { supabase, updates };
}

const base = {
  membershipId: "um-1",
  userId: "user-1",
  providerId: "provider-1",
  planId: "plan-1",
  expiresAt: "2026-11-01T00:00:00.000Z",
  metadata: { membership_order_id: "order-old" },
  now: new Date("2026-11-14T00:00:00.000Z"),
};

describe("resumeUnopenedMembershipRenewal", () => {
  it("opens the month from a saved renewal payment without another charge", async () => {
    const { supabase, updates } = supabaseFor({
      orders: [{ id: "order-new", status: "pending", payment: true }],
    });

    const result = await resumeUnopenedMembershipRenewal({
      ...base,
      supabase: supabase as never,
    });

    const periodEnd = renewalPeriodEnd(base.expiresAt, base.now).toISOString();
    expect(result).toBe("opened");
    const term = updates.find((row) => row.table === "user_memberships");
    expect(term?.values.status).toBe("active");
    expect(term?.values.expires_at).toBe(periodEnd);
    expect(term?.values.next_billing_at).toBe(periodEnd);
    expect((term?.values.metadata as { membership_order_id?: string }).membership_order_id).toBe(
      "order-new",
    );
    expect(updates.find((row) => row.table === "membership_orders")?.values.status).toBe("paid");
  });

  it("leaves the month unchanged when that payment already opened it", async () => {
    const { supabase, updates } = supabaseFor({
      orders: [{ id: "order-old", payment: true }],
    });

    const result = await resumeUnopenedMembershipRenewal({
      ...base,
      supabase: supabase as never,
    });

    expect(result).toBe("unchanged");
    expect(updates).toHaveLength(0);
  });

  it("leaves the month unchanged when the renewal order has no saved payment", async () => {
    const { supabase, updates } = supabaseFor({
      orders: [{ id: "order-new", status: "pending", payment: false }],
    });

    const result = await resumeUnopenedMembershipRenewal({
      ...base,
      supabase: supabase as never,
    });

    expect(result).toBe("unchanged");
    expect(updates).toHaveLength(0);
  });

  it("opens the month from an older saved payment when a newer charge failed", async () => {
    const { supabase, updates } = supabaseFor({
      orders: [
        { id: "order-failed", status: "failed", payment: false },
        { id: "order-saved", status: "failed", payment: true },
      ],
    });

    const result = await resumeUnopenedMembershipRenewal({
      ...base,
      supabase: supabase as never,
    });

    expect(result).toBe("opened");
    const term = updates.find((row) => row.table === "user_memberships");
    expect((term?.values.metadata as { membership_order_id?: string }).membership_order_id).toBe(
      "order-saved",
    );
    expect(updates.find((row) => row.table === "membership_orders")?.id).toBe("order-saved");
  });

  it("marks the open month paid and keeps that end date", async () => {
    const { supabase, updates } = supabaseFor({
      orders: [{ id: "order-old", status: "pending", payment: true }],
    });
    const expiresAt = "2026-12-14T00:00:00.000Z";

    const result = await resumeUnopenedMembershipRenewal({
      ...base,
      expiresAt,
      supabase: supabase as never,
    });

    expect(result).toBe("opened");
    const term = updates.find((row) => row.table === "user_memberships");
    expect(term?.values.next_billing_at).toBe(expiresAt);
    expect(term?.values.expires_at).toBeUndefined();
    expect(updates.find((row) => row.table === "membership_orders")?.values.status).toBe("paid");
  });

  it("marks a finished month paid before the next charge", async () => {
    const { supabase, updates } = supabaseFor({
      orders: [{ id: "order-old", status: "failed", payment: true }],
    });

    const result = await resumeUnopenedMembershipRenewal({
      ...base,
      supabase: supabase as never,
    });

    expect(result).toBe("unchanged");
    expect(updates.find((row) => row.table === "user_memberships")).toBeUndefined();
    expect(updates.find((row) => row.table === "membership_orders")?.values).toMatchObject({
      status: "paid",
      paystack_reference: "mem_renew_1",
    });
  });

  it("marks the finished order paid when a later saved payment opens the next month", async () => {
    const { supabase, updates } = supabaseFor({
      orders: [
        { id: "order-new", status: "pending", payment: true },
        { id: "order-old", status: "failed", payment: true },
      ],
    });

    const result = await resumeUnopenedMembershipRenewal({
      ...base,
      supabase: supabase as never,
    });

    expect(result).toBe("opened");
    const paidIds = updates
      .filter((row) => row.table === "membership_orders")
      .map((row) => row.id);
    expect(paidIds).toEqual(["order-old", "order-new"]);
    const term = updates.find((row) => row.table === "user_memberships");
    expect((term?.values.metadata as { membership_order_id?: string }).membership_order_id).toBe(
      "order-new",
    );
  });
});

describe("stampOpenedMembershipOrders", () => {
  it("marks an open month paid and leaves the end date", async () => {
    const { supabase, updates } = supabaseFor({
      orders: [{ id: "order-open", status: "pending", payment: true }],
      openMonths: [
        {
          orderId: "order-open",
          expiresAt: "2026-12-14T00:00:00.000Z",
          nextBillingAt: "2026-12-14T00:00:00.000Z",
        },
      ],
    });

    const stamped = await stampOpenedMembershipOrders(
      supabase as never,
      new Date("2026-11-14T00:00:00.000Z"),
    );

    expect(stamped).toBe(1);
    expect(updates.find((row) => row.table === "membership_orders")?.values).toMatchObject({
      status: "paid",
      paystack_reference: "mem_renew_1",
    });
    expect(updates.some((row) => row.table === "user_memberships")).toBe(false);
  });

  it("leaves an order unpaid when its month is still closed", async () => {
    const { supabase, updates } = supabaseFor({
      orders: [{ id: "order-closed", status: "failed", payment: true }],
    });

    const stamped = await stampOpenedMembershipOrders(
      supabase as never,
      new Date("2026-11-14T00:00:00.000Z"),
    );

    expect(stamped).toBe(0);
    expect(updates).toEqual([]);
  });

  it("leaves a due open month for the renewal run", async () => {
    const { supabase, updates } = supabaseFor({
      orders: [{ id: "order-open", status: "pending", payment: true }],
      openMonths: [
        {
          orderId: "order-open",
          expiresAt: "2026-12-14T00:00:00.000Z",
          nextBillingAt: "2026-11-01T00:00:00.000Z",
        },
      ],
    });

    const stamped = await stampOpenedMembershipOrders(
      supabase as never,
      new Date("2026-11-14T00:00:00.000Z"),
    );

    expect(stamped).toBe(0);
    expect(updates).toEqual([]);
  });

  it("marks a finished month paid without moving its end date", async () => {
    const { supabase, updates } = supabaseFor({
      orders: [{ id: "order-finished", status: "failed", payment: true }],
      openMonths: [
        {
          orderId: "order-finished",
          expiresAt: "2026-11-01T00:00:00.000Z",
          nextBillingAt: "2026-11-01T00:00:00.000Z",
        },
      ],
    });

    const stamped = await stampOpenedMembershipOrders(
      supabase as never,
      new Date("2026-11-14T00:00:00.000Z"),
    );

    expect(stamped).toBe(1);
    expect(updates.some((row) => row.table === "user_memberships")).toBe(false);
    expect(updates.find((row) => row.table === "membership_orders")?.values.status).toBe("paid");
  });
});
