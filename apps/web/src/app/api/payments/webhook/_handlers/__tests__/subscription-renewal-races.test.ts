/**
 * Race-condition regression tests for provider subscription renewals.
 *
 * Covers:
 *  1. success-then-failed: late charge.failed / invoice.payment_failed must NOT
 *     flip an already-recognized renewal to past_due
 *  2. failed-then-success: a prior failed payment_transactions row for the same
 *     reference must not block activation + ledger recognition
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { handleChargeFailed } from "../charge-success";
import {
  handleSubscriptionEvent,
  recordSuccessfulProviderSubscriptionRenewalFromInvoice,
} from "../subscription-events";
import type { PaystackEvent, SupabaseClient } from "../shared";

vi.mock("@/lib/finance/resolve-tenant-id-for-ledger", () => ({
  resolveTenantIdForFinanceLedger: vi.fn(async () => "tenant-1"),
}));

vi.mock("@/lib/regions/config", () => ({
  getTenantRegionConfig: vi.fn(async () => ({ defaultCurrency: "ZAR" })),
}));

vi.mock("@/lib/notifications/onesignal", () => ({
  sendToUser: vi.fn(async () => undefined),
  sendTemplateNotification: vi.fn(async () => undefined),
}));

vi.mock("@/lib/analytics/amplitude/server", () => ({
  trackServer: vi.fn(async () => undefined),
}));

vi.mock("@/lib/receipts/receipt-download-token", () => ({
  buildProviderSubscriptionReceiptUrl: vi.fn(() => "https://example.com/receipt"),
}));

describe("subscription renewal success-then-failed race", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("charge.failed skips past_due when the charge reference already has a success payment_tx", async () => {
    const subscriptionUpdates: Array<Record<string, unknown>> = [];
    const paymentInserts: unknown[] = [];

    const paymentTxSelect = () => {
      const filters: string[] = [];
      const chain: any = {
        eq: (col: string, val: string) => {
          filters.push(`${col}=${val}`);
          return chain;
        },
        maybeSingle: async () => {
          const wantsFailed = filters.includes("status=failed");
          const wantsSuccess = filters.includes("status=success");
          if (wantsSuccess && filters.includes("reference=txn_renew_ok")) {
            return { data: { id: "success-tx-1" }, error: null };
          }
          if (wantsFailed) {
            return { data: null, error: null };
          }
          return { data: null, error: null };
        },
      };
      return chain;
    };

    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === "payment_transactions") {
          return {
            select: vi.fn(() => paymentTxSelect()),
            insert: vi.fn((row: unknown) => {
              paymentInserts.push(row);
              return Promise.resolve({ error: null });
            }),
          };
        }
        if (table === "provider_subscriptions") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: {
                    provider_id: "provider-1",
                    plan_id: "plan-1",
                    status: "active",
                    subscription_plans: { name: "Pro" },
                  },
                  error: null,
                })),
              })),
            })),
            update: vi.fn((values: Record<string, unknown>) => {
              subscriptionUpdates.push(values);
              return {
                eq: vi.fn(() => ({
                  in: vi.fn(async () => ({ error: null })),
                })),
              };
            }),
          };
        }
        throw new Error(`unexpected table: ${table}`);
      }),
      rpc: vi.fn(async () => ({ data: null, error: null })),
    } as unknown as SupabaseClient;

    const event = {
      event: "charge.failed",
      data: {
        reference: "txn_renew_ok",
        message: "Declined",
        gateway_response: "Declined",
        amount: 5000,
        fees: 100,
        subscription: { subscription_code: "SUB_abc" },
        metadata: {},
      },
    } as unknown as PaystackEvent;

    await handleChargeFailed(event, mockSupabase);

    expect(subscriptionUpdates).toHaveLength(0);
    expect(paymentInserts).toHaveLength(0);
  });

  it("invoice.payment_failed skips past_due when invoice/txn already succeeded", async () => {
    const subscriptionUpdates: Array<Record<string, unknown>> = [];
    const paymentInserts: unknown[] = [];

    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === "payment_transactions") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({
                      data: { id: "success-tx-1" },
                      error: null,
                    })),
                  })),
                  maybeSingle: vi.fn(async () => ({
                    data: { id: "success-tx-1" },
                    error: null,
                  })),
                })),
              })),
            })),
            insert: vi.fn((row: unknown) => {
              paymentInserts.push(row);
              return Promise.resolve({ error: null });
            }),
          };
        }
        if (table === "provider_subscriptions") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: { provider_id: "provider-1" },
                  error: null,
                })),
                single: vi.fn(async () => ({
                  data: { provider_id: "provider-1", billing_period: "monthly", plan_id: "plan-1" },
                  error: null,
                })),
              })),
            })),
            update: vi.fn((values: Record<string, unknown>) => {
              subscriptionUpdates.push(values);
              return {
                eq: vi.fn(() => ({
                  in: vi.fn(async () => ({ error: null })),
                })),
              };
            }),
          };
        }
        throw new Error(`unexpected table: ${table}`);
      }),
    } as unknown as SupabaseClient;

    await handleSubscriptionEvent(
      {
        event: "invoice.payment_failed",
        data: {
          subscription: { subscription_code: "SUB_abc" },
          invoice_code: "INV_1",
          amount: 5000,
          fees: 100,
          transaction: { reference: "txn_renew_ok" },
        },
      } as unknown as PaystackEvent,
      mockSupabase,
    );

    expect(subscriptionUpdates).toHaveLength(0);
    expect(paymentInserts).toHaveLength(0);
  });
});

describe("subscription renewal failed-then-success", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("activates and records money after clearing a prior failed payment_tx for the same ref", async () => {
    const deletedIds: string[] = [];
    const paymentInserts: unknown[] = [];
    const financeInserts: unknown[] = [];
    const subscriptionUpdates: Array<Record<string, unknown>> = [];
    let paymentSelectCalls = 0;

    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === "payment_transactions") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => {
                    paymentSelectCalls += 1;
                    // First call in recordSuccessful…: existing failed row
                    // Later calls inside recordProviderSubscriptionPayment: after delete, none
                    if (paymentSelectCalls === 1) {
                      return { data: { id: "failed-tx-1", status: "failed" }, error: null };
                    }
                    return { data: null, error: null };
                  }),
                })),
              })),
            })),
            delete: vi.fn(() => ({
              eq: vi.fn(async (_k: string, id: string) => {
                deletedIds.push(id);
                return { error: null };
              }),
            })),
            insert: vi.fn((row: unknown) => {
              paymentInserts.push(row);
              return Promise.resolve({ error: null });
            }),
          };
        }
        if (table === "provider_subscriptions") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: {
                    billing_period: "monthly",
                    plan_id: "plan-1",
                    provider_id: "provider-1",
                    tenant_id: "tenant-1",
                  },
                  error: null,
                })),
              })),
            })),
            update: vi.fn((values: Record<string, unknown>) => {
              subscriptionUpdates.push(values);
              return {
                eq: vi.fn(async () => ({ error: null })),
              };
            }),
          };
        }
        if (table === "finance_transactions") {
          return {
            insert: vi.fn((row: unknown) => {
              financeInserts.push(row);
              return {
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({
                    data: { id: "fin-1" },
                    error: null,
                  })),
                })),
              };
            }),
          };
        }
        if (table === "providers") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: { user_id: null, business_name: "Co", tenant_id: "tenant-1" },
                  error: null,
                })),
              })),
            })),
          };
        }
        if (table === "subscription_plans") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: { name: "Pro", currency: "ZAR" },
                  error: null,
                })),
                single: vi.fn(async () => ({
                  data: { name: "Pro", currency: "ZAR", price_monthly: 50, price_yearly: 500 },
                  error: null,
                })),
              })),
            })),
          };
        }
        throw new Error(`unexpected table: ${table}`);
      }),
    } as unknown as SupabaseClient;

    await recordSuccessfulProviderSubscriptionRenewalFromInvoice(mockSupabase, {
      subscriptionCode: "SUB_abc",
      invoiceCode: "INV_failed_then_ok",
      amount: 10_000,
      fees: 200,
      paidAt: "2026-07-01T12:00:00.000Z",
      payload: {},
      providerId: "provider-1",
    });

    expect(deletedIds).toContain("failed-tx-1");
    expect(subscriptionUpdates.some((u) => u.status === "active")).toBe(true);
    expect(paymentInserts.length).toBeGreaterThanOrEqual(1);
    expect(financeInserts.length).toBeGreaterThanOrEqual(1);
  });
});
