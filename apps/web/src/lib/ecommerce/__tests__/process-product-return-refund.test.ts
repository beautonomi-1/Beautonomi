import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  processProductReturnRefund,
  ProductReturnRefundError,
} from "../process-product-return-refund";

const ORDER_ID = "order-1";
const RETURN_ID = "return-1";
const ITEM_ID = "item-1";

function makeSupabasePair(options: {
  order?: Record<string, unknown> | null;
  walletError?: { message: string } | null;
  orderUpdateError?: { message: string } | null;
}) {
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const updates: Array<{ table: string; payload: Record<string, unknown> }> = [];

  const orderSelect = vi.fn(() => ({
    eq: () => ({
      maybeSingle: async () => ({
        data: options.order === undefined
          ? {
              id: ORDER_ID,
              provider_id: "prov-1",
              payment_status: "paid",
              total_amount: 200,
              customer_id: "cust-1",
              currency: "ZAR",
              tenant_id: "tenant-1",
              order_number: "ORD-1",
              refunded_amount: 0,
              status: "delivered",
            }
          : options.order,
        error: options.order === null ? { message: "not found" } : null,
      }),
    }),
  }));

  const from = vi.fn((table: string) => {
    if (table === "product_orders") {
      return {
        select: orderSelect,
        update: (payload: Record<string, unknown>) => {
          updates.push({ table, payload });
          return {
            eq: async () => ({ error: options.orderUpdateError ?? null }),
          };
        },
      };
    }
    if (table === "product_order_items") {
      const itemRows = [
        {
          id: ITEM_ID,
          product_id: "prod-1",
          product_variant_id: null,
          quantity: 3,
        },
      ];
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.in = () => chain;
      chain.then = (onFulfilled: (v: { data: typeof itemRows }) => unknown) =>
        Promise.resolve(onFulfilled({ data: itemRows }));
      return chain;
    }
    if (table === "products") {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { quantity: 5 } }),
            maybeSingle: async () => ({ data: { quantity: 5 } }),
          }),
        }),
        update: () => ({ eq: async () => ({ error: null }) }),
      };
    }
    if (table === "stock_movements") {
      return { insert: async () => ({ error: null }) };
    }
    if (table === "finance_transactions") {
      return {
        select: () => ({
          eq: () => ({
            in: () => ({
              limit: async () => ({ data: [] }),
            }),
            eq: () => ({
              limit: async () => ({ data: [] }),
            }),
          }),
        }),
        insert: async () => ({ error: null }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });

  const supabase = {
    from,
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      if (fn === "increment_product_stock") return { error: null };
      return { error: null };
    }),
  } as unknown as SupabaseClient;

  const admin = {
    from,
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      if (fn === "wallet_credit_admin") {
        return { error: options.walletError ?? null };
      }
      return { error: null };
    }),
  } as unknown as SupabaseClient;

  return { supabase, admin, rpcCalls, updates };
}

describe("processProductReturnRefund", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("credits wallet with return-scoped idempotency key before marking return refunded", async () => {
    const { supabase, admin, rpcCalls } = makeSupabasePair({});

    const result = await processProductReturnRefund({
      supabase,
      admin,
      returnId: RETURN_ID,
      orderId: ORDER_ID,
      orderItemId: ITEM_ID,
      returnQuantity: 1,
      refundAmount: 50,
      refundMethod: "store_credit",
      actorUserId: "user-1",
    });

    expect(result.refundAmount).toBe(50);
    const walletCall = rpcCalls.find((c) => c.fn === "wallet_credit_admin");
    expect(walletCall?.args.p_idempotency_key).toBe(`product_return_refund:${RETURN_ID}`);
    expect(walletCall?.args.p_amount).toBe(50);
  });

  it("throws without updating when wallet credit fails (return stays item_received)", async () => {
    const { supabase, admin } = makeSupabasePair({
      walletError: { message: "wallet down" },
    });

    await expect(
      processProductReturnRefund({
        supabase,
        admin,
        returnId: RETURN_ID,
        orderId: ORDER_ID,
        orderItemId: ITEM_ID,
        returnQuantity: 1,
        refundAmount: 50,
        refundMethod: "store_credit",
        actorUserId: "user-1",
      }),
    ).rejects.toMatchObject({ code: "WALLET_CREDIT_FAILED" });
  });

  it("restocks only the returned quantity for partial line returns", async () => {
    const { supabase, admin, rpcCalls } = makeSupabasePair({});

    await processProductReturnRefund({
      supabase,
      admin,
      returnId: RETURN_ID,
      orderId: ORDER_ID,
      orderItemId: ITEM_ID,
      returnQuantity: 1,
      refundAmount: 50,
      refundMethod: "store_credit",
      actorUserId: "user-1",
    });

    const stockRpc = rpcCalls.find((c) => c.fn === "increment_product_stock");
    expect(stockRpc?.args.p_quantity).toBe(1);
  });

  it("marks order partially_refunded when return amount is less than total", async () => {
    const { supabase, admin, updates } = makeSupabasePair({});

    await processProductReturnRefund({
      supabase,
      admin,
      returnId: RETURN_ID,
      orderId: ORDER_ID,
      orderItemId: ITEM_ID,
      returnQuantity: 1,
      refundAmount: 50,
      refundMethod: "store_credit",
      actorUserId: "user-1",
    });

    const orderUpdate = updates.find((u) => u.table === "product_orders");
    expect(orderUpdate?.payload.payment_status).toBe("partially_refunded");
    expect(orderUpdate?.payload.refunded_amount).toBe(50);
  });

  it("rejects store credit when order has no customer account", async () => {
    const { supabase, admin } = makeSupabasePair({
      order: {
        id: ORDER_ID,
        provider_id: "prov-1",
        payment_status: "paid",
        total_amount: 200,
        customer_id: null,
        currency: "ZAR",
        tenant_id: "tenant-1",
        order_number: "ORD-1",
        refunded_amount: 0,
        status: "delivered",
      },
    });

    await expect(
      processProductReturnRefund({
        supabase,
        admin,
        returnId: RETURN_ID,
        orderId: ORDER_ID,
        orderItemId: null,
        returnQuantity: 1,
        refundAmount: 50,
        refundMethod: "store_credit",
        actorUserId: "user-1",
      }),
    ).rejects.toBeInstanceOf(ProductReturnRefundError);
  });
});
