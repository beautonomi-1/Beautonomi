import { describe, expect, it } from "vitest";
import { completeClaimedGiftCardOrder, ensureGiftCardSaleLedger, releaseGiftCardOrderClaim } from "../ensure-gift-card-sale";

type Row = Record<string, unknown>;

function makeDb(initial?: { finance?: Row[]; cards?: Row[]; failInsert?: boolean }) {
  const finance = [...(initial?.finance ?? [])];
  const inserts: Row[] = [];

  function chain(rows: Row[]) {
    const filters: Array<(row: Row) => boolean> = [];
    const matched = () => rows.filter((row) => filters.every((fn) => fn(row)));
    const api = {
      select: () => api,
      eq: (key: string, value: unknown) => {
        filters.push((row) => row[key] === value);
        return api;
      },
      contains: (key: string, value: Row) => {
        filters.push((row) => {
          const meta = row[key];
          if (!meta || typeof meta !== "object") return false;
          return Object.entries(value).every(([k, v]) => (meta as Row)[k] === v);
        });
        return api;
      },
      gte: (key: string, value: string) => {
        filters.push((row) => String(row[key] ?? "") >= value);
        return api;
      },
      lte: (key: string, value: string) => {
        filters.push((row) => String(row[key] ?? "") <= value);
        return api;
      },
      order: () => api,
      limit: () => api,
      maybeSingle: async () => ({ data: matched()[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve({ data: matched(), error: null }).then(resolve, reject),
    };
    return api;
  }

  const orderUpdates: Row[] = [];
  const paymentUpdates: Row[] = [];

  return {
    inserts,
    orderUpdates,
    paymentUpdates,
    supabase: {
      from: (table: string) => {
        if (table === "finance_transactions") {
          return {
            ...chain(finance),
            insert: async (row: Row) => {
              if (initial?.failInsert) return { error: { code: "XX000", message: "db down" } };
              inserts.push(row);
              finance.push({ id: "sale-new", ...row });
              return { error: null };
            },
          };
        }
        if (table === "gift_cards") return chain(initial?.cards ?? []);
        if (table === "gift_card_orders") {
          return {
            update: (payload: Row) => ({
              eq: async () => {
                orderUpdates.push(payload);
                return { error: null };
              },
            }),
          };
        }
        if (table === "payment_transactions") {
          return {
            update: (payload: Row) => ({
              eq: () => ({
                eq: async () => {
                  paymentUpdates.push(payload);
                  return { error: null };
                },
              }),
            }),
          };
        }
        throw new Error(`unexpected table: ${table}`);
      },
    },
  };
}

const input = {
  orderId: "order-1",
  quantity: 1,
  totalAmount: 200,
  feesMajor: 6,
  providerId: null,
  tenantId: "tenant-1",
};

describe("ensureGiftCardSaleLedger", () => {
  it("posts the sale when the cards were already issued", async () => {
    const db = makeDb({
      cards: [{ created_at: "2026-01-01T00:00:00.000Z", metadata: { order_id: "order-1" } }],
    });

    const result = await ensureGiftCardSaleLedger(db.supabase as never, input);

    expect(result.posted).toBe(true);
    expect(db.inserts).toHaveLength(1);
    expect(db.inserts[0].transaction_type).toBe("gift_card_sale");
    expect(db.inserts[0].net).toBe(200);
    expect(db.inserts[0].metadata).toEqual({ gift_card_order_id: "order-1", quantity: 1 });
  });

  it("does not post the sale again when it is already saved", async () => {
    const db = makeDb({
      finance: [
        {
          id: "sale-1",
          transaction_type: "gift_card_sale",
          metadata: { gift_card_order_id: "order-1" },
        },
      ],
    });

    const result = await ensureGiftCardSaleLedger(db.supabase as never, input);

    expect(result.posted).toBe(false);
    expect(db.inserts).toHaveLength(0);
  });

  it("keeps a sale that was saved beside the issued card", async () => {
    const issuedAt = "2026-01-01T00:00:00.000Z";
    const db = makeDb({
      cards: [{ created_at: issuedAt, metadata: { order_id: "order-1" } }],
      finance: [
        {
          id: "sale-1",
          transaction_type: "gift_card_sale",
          amount: 200,
          description: "Platform gift card sale (1 card) - liability until redemption",
          created_at: "2026-01-01T00:00:30.000Z",
        },
      ],
    });

    const result = await ensureGiftCardSaleLedger(db.supabase as never, input);

    expect(result.posted).toBe(false);
    expect(db.inserts).toHaveLength(0);
  });
});

describe("completeClaimedGiftCardOrder", () => {
  it("marks the order paid and posts the sale when the cards were already issued", async () => {
    const db = makeDb({
      cards: [
        { id: "card-1", metadata: { order_id: "order-1" }, created_at: "2026-01-01T00:00:00.000Z" },
      ],
    });

    const result = await completeClaimedGiftCardOrder(db.supabase as never, {
      ...input,
      reference: "ref-1",
      paymentProvider: "paystack",
      orderMetadata: { template_id: "tpl-1" },
    });

    expect(result.completed).toBe(true);
    expect(db.orderUpdates[0].status).toBe("paid");
    expect(db.orderUpdates[0].gift_card_id).toBe("card-1");
    expect(db.orderUpdates[0].metadata).toMatchObject({
      template_id: "tpl-1",
      issued_count: 1,
      expected_count: 1,
    });
    expect(db.paymentUpdates[0].metadata).toMatchObject({
      gift_card_ids: ["card-1"],
      issued_count: 1,
    });
    expect(db.inserts).toHaveLength(1);
    expect(db.inserts[0].transaction_type).toBe("gift_card_sale");
  });

  it("leaves the claim when no card has been issued", async () => {
    const db = makeDb();

    const result = await completeClaimedGiftCardOrder(db.supabase as never, {
      ...input,
      reference: "ref-1",
      paymentProvider: "paystack",
      orderMetadata: null,
    });

    expect(result.completed).toBe(false);
    expect(db.orderUpdates).toHaveLength(0);
    expect(db.inserts).toHaveLength(0);
  });
});

describe("releaseGiftCardOrderClaim", () => {
  it("releases the claim for the provider that saved it", async () => {
    const deleted: { key: string; value: string }[] = [];
    const supabase = {
      from: (table: string) => {
        if (table !== "payment_transactions") throw new Error(table);
        return {
          delete: () => ({
            eq: (key: string, value: string) => {
              deleted.push({ key, value });
              return {
                eq: async (key2: string, value2: string) => {
                  deleted.push({ key: key2, value: value2 });
                  return { error: null };
                },
              };
            },
          }),
        };
      },
    };

    await releaseGiftCardOrderClaim(supabase as never, "stripe", "ref-1");

    expect(deleted).toEqual([
      { key: "provider", value: "stripe" },
      { key: "reference", value: "ref-1" },
    ]);
  });
});
