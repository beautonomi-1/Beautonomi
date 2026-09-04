import { describe, expect, it } from "vitest";

import {
  summarizeProviderLedgerUiRows,
  buildProviderTransactionsFeed,
} from "@/lib/provider/provider-transactions-feed";
import type { ProviderLedgerUiRow } from "@/lib/provider/provider-ledger-transaction-view";

describe("summarizeProviderLedgerUiRows", () => {
  it("includes fees in net but not in total_out", () => {
    const rows: ProviderLedgerUiRow[] = [
      {
        id: "1",
        type: "earning",
        amount: 100,
        sign: 1,
        description: "Earnings",
        status: "completed",
        created_at: "2026-01-01T00:00:00Z",
        client_name: null,
        payment_method: null,
        reference: null,
        booking_id: null,
        product_order_id: null,
        notes: null,
        transaction_type: "provider_earnings",
        currency: "ZAR",
      },
      {
        id: "2",
        type: "fee",
        amount: 10,
        sign: -1,
        description: "Fee",
        status: "completed",
        created_at: "2026-01-01T00:00:00Z",
        client_name: null,
        payment_method: null,
        reference: null,
        booking_id: null,
        product_order_id: null,
        notes: null,
        transaction_type: "platform_fee",
        currency: "ZAR",
      },
    ];

    const summary = summarizeProviderLedgerUiRows(rows);
    expect(summary.total_in).toBe(100);
    expect(summary.total_out).toBe(0);
    expect(summary.net).toBe(90);
    expect(summary.row_count).toBe(2);
  });
});

describe("buildProviderTransactionsFeed", () => {
  it("enriches only the requested list page", async () => {
    const ledgerRows = Array.from({ length: 5 }, (_, i) => ({
      id: `row-${i}`,
      transaction_type: "provider_earnings",
      amount: 10,
      net: 10,
      created_at: `2026-07-0${5 - i}T12:00:00.000Z`,
      description: `Booking ${i}`,
      booking_id: `booking-${i}`,
      product_order_id: null,
      metadata: null,
      refund_component: null,
      currency: "ZAR",
      source_payment_id: null,
    }));

    let enrichBatchSize = 0;
    const db = {
      from: (table: string) => {
        if (table === "finance_transactions") {
          const chain: Record<string, unknown> = {};
          chain.select = () => chain;
          chain.eq = () => chain;
          chain.gte = () => chain;
          chain.in = () => chain;
          chain.order = () => chain;
          chain.range = () => Promise.resolve({ data: ledgerRows, error: null });
          return chain;
        }
        if (table === "bookings") {
          const chain: Record<string, unknown> = {};
          chain.select = () => chain;
          chain.eq = () => chain;
          chain.in = (_col: string, ids: string[]) => {
            enrichBatchSize = ids.length;
            return Promise.resolve({
              data: ids.map((id) => ({
                id,
                booking_number: `BTN-${id}`,
                customer_id: null,
                guest_name: "Guest",
              })),
              error: null,
            });
          };
          return chain;
        }
        if (table === "booking_payments" || table === "users" || table === "product_orders") {
          const chain: Record<string, unknown> = {};
          chain.select = () => chain;
          chain.in = () => Promise.resolve({ data: [], error: null });
          return chain;
        }
        throw new Error(`Unexpected table ${table}`);
      },
    };

    const result = await buildProviderTransactionsFeed({
      db: db as never,
      providerId: "provider-1",
      timezone: "Africa/Johannesburg",
      period: "month",
      limit: 2,
      listOffset: 0,
      locationId: null,
      typeFilter: "all",
    });

    expect(result.transactions).toHaveLength(2);
    expect(result.list_total).toBe(5);
    expect(enrichBatchSize).toBe(2);
    expect(result.summary.row_count).toBe(5);
  });

  it("treats an exact-page PostgREST range as end of ledger instead of failing the feed", async () => {
    const ledgerRows = Array.from({ length: 1000 }, (_, i) => ({
      id: `row-${i}`,
      transaction_type: "provider_earnings",
      amount: 10,
      net: 10,
      created_at: "2026-07-01T12:00:00.000Z",
      description: `Booking ${i}`,
      booking_id: `booking-${i}`,
      product_order_id: null,
      refund_component: null,
      currency: "ZAR",
      source_payment_id: null,
    }));

    let rangeCalls = 0;
    const db = {
      from: (table: string) => {
        if (table === "finance_transactions") {
          const chain: Record<string, unknown> = {};
          chain.select = () => chain;
          chain.eq = () => chain;
          chain.gte = () => chain;
          chain.in = () => chain;
          chain.order = () => chain;
          chain.range = (from: number) => {
            rangeCalls += 1;
            if (from === 0) return Promise.resolve({ data: ledgerRows, error: null });
            return Promise.resolve({
              data: null,
              error: { code: "PGRST103", message: "Requested range not satisfiable" },
            });
          };
          return chain;
        }
        if (table === "bookings") {
          const chain: Record<string, unknown> = {};
          chain.select = () => chain;
          chain.eq = () => chain;
          chain.in = (_col: string, ids: string[]) =>
            Promise.resolve({
              data: ids.map((id) => ({
                id,
                booking_number: `BTN-${id}`,
                customer_id: null,
                guest_name: "Guest",
              })),
              error: null,
            });
          return chain;
        }
        if (table === "booking_payments" || table === "users" || table === "product_orders") {
          const chain: Record<string, unknown> = {};
          chain.select = () => chain;
          chain.in = () => Promise.resolve({ data: [], error: null });
          return chain;
        }
        throw new Error(`Unexpected table ${table}`);
      },
    };

    const result = await buildProviderTransactionsFeed({
      db: db as never,
      providerId: "provider-1",
      timezone: "Africa/Johannesburg",
      period: "all",
      limit: 2,
      listOffset: 0,
      locationId: null,
      typeFilter: "all",
    });

    expect(rangeCalls).toBe(2);
    expect(result.list_total).toBe(1000);
    expect(result.summary.total_in).toBe(10_000);
    expect(result.transactions).toHaveLength(2);
  });
});
