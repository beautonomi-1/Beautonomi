import { describe, expect, it, vi } from "vitest";
import { validatePaycloudPaymentInitiate } from "../paycloud-initiate-guards";

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              in: () => ({
                gte: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({ data: null }),
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    }),
  }),
}));

function supabaseFor(rows: Record<string, Record<string, unknown> | null>) {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: rows[table] ?? null }),
          }),
        }),
      }),
    }),
  } as never;
}

const terminal = { id: "terminal-1", status: "active", is_active: true, in_flight_payment_id: null };

describe("validatePaycloudPaymentInitiate", () => {
  it("rejects invoice entity type before hitting the database", async () => {
    const supabase = {} as never;
    const result = await validatePaycloudPaymentInitiate(supabase, {
      providerId: "provider-1",
      terminalId: "terminal-1",
      entityType: "invoice",
      entityId: "inv-1",
      environment: "sandbox",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("INVALID_ENTITY");
    }
  });

  it("refuses a refunded till sale and a partly refunded order", async () => {
    const sale = await validatePaycloudPaymentInitiate(
      supabaseFor({ paycloud_terminals: terminal, sales: { payment_status: "refunded" } }),
      {
        providerId: "provider-1",
        terminalId: "terminal-1",
        entityType: "sale",
        entityId: "sale-1",
        environment: "sandbox",
      },
    );
    expect(sale.ok).toBe(false);
    expect(sale.code).toBe("SALE_NOT_COLLECTIBLE");

    const order = await validatePaycloudPaymentInitiate(
      supabaseFor({
        paycloud_terminals: terminal,
        product_orders: { payment_status: "partially_refunded", status: "delivered", order_source: "walk_in" },
      }),
      {
        providerId: "provider-1",
        terminalId: "terminal-1",
        entityType: "product_order",
        entityId: "order-1",
        environment: "sandbox",
      },
    );
    expect(order.ok).toBe(false);
    expect(order.code).toBe("ORDER_NOT_COLLECTIBLE");
  });

  it("still allows a pending till sale to be charged", async () => {
    const sale = await validatePaycloudPaymentInitiate(
      supabaseFor({ paycloud_terminals: terminal, sales: { payment_status: "pending" } }),
      {
        providerId: "provider-1",
        terminalId: "terminal-1",
        entityType: "sale",
        entityId: "sale-1",
        environment: "sandbox",
      },
    );
    expect(sale.ok).toBe(true);
  });
});
