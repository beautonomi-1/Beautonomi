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

const createRefund = vi.fn(async () => ({ status: true, message: "ok", data: {} }));
const disableSubscriptionByCode = vi.fn(async () => ({ status: true, message: "ok", data: {} }));
vi.mock("@/lib/payments/paystack-complete", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/payments/paystack-complete")>();
  return {
    ...actual,
    createRefund: (...args: unknown[]) => createRefund(...args),
    disableSubscriptionByCode: (...args: unknown[]) => disableSubscriptionByCode(...args),
  };
});

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
                  eq: vi.fn(async () => ({ error: null })),
                  in: vi.fn(async () => ({ error: null })),
                })),
              };
            }),
          };
        }
        if (table === "wallet_topups" || table === "bookings") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: null, error: null })),
              })),
            })),
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

  it("charge.failed skips past_due when the charge was already returned", async () => {
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
          if (filters.includes("status=refunded") && filters.includes("reference=txn_returned")) {
            return { data: { id: "refunded-tx-1" }, error: null };
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
                  data: { provider_id: "provider-1", status: "active" },
                  error: null,
                })),
              })),
            })),
            update: vi.fn((values: Record<string, unknown>) => {
              subscriptionUpdates.push(values);
              return { eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })) };
            }),
          };
        }
        if (table === "wallet_topups" || table === "bookings") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: null, error: null })),
              })),
            })),
          };
        }
        throw new Error(`unexpected table: ${table}`);
      }),
    } as unknown as SupabaseClient;

    await handleChargeFailed(
      {
        event: "charge.failed",
        data: {
          reference: "txn_returned",
          message: "Declined",
          amount: 5000,
          fees: 100,
          subscription: { subscription_code: "SUB_abc" },
          metadata: {},
        },
      } as unknown as PaystackEvent,
      mockSupabase,
    );

    expect(subscriptionUpdates).toHaveLength(0);
    expect(paymentInserts).toHaveLength(0);
  });

  it("returns a Paystack invoice when Stripe already owns the plan", async () => {
    const subscriptionUpdates: Array<Record<string, unknown>> = [];
    const paymentInserts: unknown[] = [];
    const stripeRow = {
      provider_id: "provider-1",
      tenant_id: "tenant-za",
      billing_provider: "stripe",
      status: "active",
      paystack_subscription_code: "SUB_abc",
    };
    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === "payment_transactions") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                  })),
                  maybeSingle: vi.fn(async () => ({ data: null, error: null })),
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
                maybeSingle: vi.fn(async () => ({ data: stripeRow, error: null })),
                single: vi.fn(async () => ({ data: stripeRow, error: null })),
              })),
            })),
            update: vi.fn((values: Record<string, unknown>) => {
              subscriptionUpdates.push(values);
              return { eq: vi.fn(async () => ({ error: null })) };
            }),
          };
        }
        throw new Error(`unexpected table: ${table}`);
      }),
    } as unknown as SupabaseClient;

    await handleSubscriptionEvent(
      {
        event: "invoice.update",
        data: {
          subscription: { subscription_code: "SUB_abc" },
          status: "success",
          paid_at: "2026-02-01T00:00:00.000Z",
          amount: 10_000,
          currency: "ZAR",
          invoice_code: "INV_other",
          transaction: { reference: "ref-other" },
        },
      } as unknown as PaystackEvent,
      mockSupabase,
    );

    expect(createRefund).toHaveBeenCalledWith(
      {
        transaction: "ref-other",
        merchant_note:
          "Another billing account owns this subscription. This Paystack charge was returned.",
      },
      { tenantId: "tenant-za" },
    );
    expect(paymentInserts).toEqual([
      expect.objectContaining({ reference: "ref-other", status: "refunded" }),
    ]);
    expect(subscriptionUpdates).toEqual([
      expect.objectContaining({ paystack_subscription_code: "SUB_abc" }),
    ]);
  });

  it("returns an invoice when the Paystack code is not stored yet and Apple owns the plan", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const appleRow = {
      provider_id: "provider-1",
      tenant_id: "tenant-za",
      billing_provider: "apple",
      status: "active",
      paystack_subscription_code: null,
    };
    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === "users") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: { id: "user-1" }, error: null })),
              })),
              ilike: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: { id: "user-1" }, error: null })),
              })),
            })),
          };
        }
        if (table === "providers") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: { id: "provider-1" }, error: null })),
              })),
            })),
          };
        }
        if (table === "payment_transactions") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                  })),
                  maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                })),
              })),
            })),
            insert: vi.fn(() => Promise.resolve({ error: null })),
          };
        }
        if (table === "provider_subscriptions") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(async () => ({ data: null, error: { message: "not found" } })),
                maybeSingle: vi.fn(async () => ({ data: appleRow, error: null })),
              })),
            })),
            update: vi.fn((row: Record<string, unknown>) => {
              updates.push(row);
              return { eq: vi.fn(async () => ({ error: null })) };
            }),
          };
        }
        throw new Error(`unexpected table: ${table}`);
      }),
    } as unknown as SupabaseClient;

    await handleSubscriptionEvent(
      {
        event: "invoice.update",
        data: {
          subscription: { subscription_code: "SUB_new" },
          status: "success",
          paid_at: "2026-02-01T00:00:00.000Z",
          amount: 10_000,
          currency: "ZAR",
          invoice_code: "INV_unmatched",
          transaction: { reference: "ref-unmatched" },
          customer: { email: "a@b.c", customer_code: "CUS_1" },
        },
      } as unknown as PaystackEvent,
      mockSupabase,
    );

    expect(createRefund).toHaveBeenCalledWith(
      expect.objectContaining({ transaction: "ref-unmatched" }),
      { tenantId: "tenant-za" },
    );
    expect(updates).toEqual([
      expect.objectContaining({ paystack_subscription_code: "SUB_new" }),
    ]);
  });

  it("keeps a Paystack code when Apple owns the plan and the stop fails", async () => {
    disableSubscriptionByCode.mockRejectedValueOnce(new Error("paystack down"));
    const updates: Array<Record<string, unknown>> = [];
    const appleRow = {
      provider_id: "provider-1",
      tenant_id: "tenant-za",
      billing_provider: "apple",
      status: "active",
      paystack_subscription_code: null,
    };
    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === "users") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: { id: "user-1", email: "a@b.c" }, error: null })),
              })),
              ilike: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: { id: "user-1", email: "a@b.c" }, error: null })),
              })),
            })),
          };
        }
        if (table === "providers") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: { id: "provider-1", tenant_id: "tenant-za" },
                  error: null,
                })),
              })),
            })),
          };
        }
        if (table === "subscription_plans") {
          return {
            select: vi.fn(() => ({
              or: vi.fn(() => ({
                single: vi.fn(async () => ({ data: { id: "plan-1" }, error: null })),
              })),
              eq: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: { paystack_plan_code_monthly: "PLN_m", paystack_plan_code_yearly: "PLN_y" },
                  error: null,
                })),
              })),
            })),
          };
        }
        if (table === "provider_subscriptions") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: appleRow, error: null })),
              })),
            })),
            update: vi.fn((row: Record<string, unknown>) => {
              updates.push(row);
              return { eq: vi.fn(async () => ({ error: null })) };
            }),
          };
        }
        throw new Error(`unexpected table: ${table}`);
      }),
    } as unknown as SupabaseClient;

    await handleSubscriptionEvent(
      {
        event: "subscription.create",
        data: {
          subscription_code: "SUB_new",
          status: "active",
          plan: { plan_code: "PLN_m" },
          customer: { email: "a@b.c", customer_code: "CUS_1" },
        },
      } as unknown as PaystackEvent,
      mockSupabase,
    );

    expect(updates).toEqual([
      expect.objectContaining({
        paystack_subscription_code: "SUB_new",
        paystack_sync_note: "We could not stop automatic billing. Contact support if charges continue.",
      }),
    ]);
    expect(updates[0]?.paystack_sync_pending).toBeUndefined();
  });

  it("tracks a new Paystack subscription when the stored code is already stopped", async () => {
    disableSubscriptionByCode
      .mockRejectedValueOnce(new Error("new code still billing"))
      .mockResolvedValueOnce({ status: true, message: "ok", data: {} });
    const updates: Array<Record<string, unknown>> = [];
    const appleRow = {
      provider_id: "provider-1",
      tenant_id: "tenant-za",
      billing_provider: "apple",
      status: "active",
      paystack_subscription_code: "SUB_old",
    };
    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === "users") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: { id: "user-1", email: "a@b.c" }, error: null })),
              })),
              ilike: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: { id: "user-1", email: "a@b.c" }, error: null })),
              })),
            })),
          };
        }
        if (table === "providers") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: { id: "provider-1", tenant_id: "tenant-za" },
                  error: null,
                })),
              })),
            })),
          };
        }
        if (table === "subscription_plans") {
          return {
            select: vi.fn(() => ({
              or: vi.fn(() => ({
                single: vi.fn(async () => ({ data: { id: "plan-1" }, error: null })),
              })),
              eq: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: { paystack_plan_code_monthly: "PLN_m", paystack_plan_code_yearly: "PLN_y" },
                  error: null,
                })),
              })),
            })),
          };
        }
        if (table === "provider_subscriptions") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: appleRow, error: null })),
              })),
            })),
            update: vi.fn((row: Record<string, unknown>) => {
              updates.push(row);
              return { eq: vi.fn(async () => ({ error: null })) };
            }),
          };
        }
        throw new Error(`unexpected table: ${table}`);
      }),
    } as unknown as SupabaseClient;

    await handleSubscriptionEvent(
      {
        event: "subscription.create",
        data: {
          subscription_code: "SUB_new",
          status: "active",
          plan: { plan_code: "PLN_m" },
          customer: { email: "a@b.c", customer_code: "CUS_1" },
        },
      } as unknown as PaystackEvent,
      mockSupabase,
    );

    expect(disableSubscriptionByCode).toHaveBeenNthCalledWith(1, "SUB_new", expect.anything());
    expect(disableSubscriptionByCode).toHaveBeenNthCalledWith(2, "SUB_old", expect.anything());
    expect(updates).toEqual([
      expect.objectContaining({
        paystack_subscription_code: "SUB_new",
        paystack_sync_note: "We could not stop automatic billing. Contact support if charges continue.",
      }),
    ]);
  });

  it("records the failed Paystack renewal so the retry waits a day", async () => {
    const subscriptionUpdates: Array<Record<string, unknown>> = [];
    const paymentTxSelect = () => {
      const chain: any = {
        eq: () => chain,
        maybeSingle: async () => ({ data: null, error: null }),
      };
      return chain;
    };
    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === "payment_transactions") {
          return {
            select: vi.fn(() => paymentTxSelect()),
            insert: vi.fn(() => Promise.resolve({ error: null })),
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
                  eq: vi.fn(async () => ({ error: null })),
                  in: vi.fn(async () => ({ error: null })),
                })),
              };
            }),
          };
        }
        if (table === "providers" || table === "wallet_topups" || table === "bookings") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: null, error: null })),
              })),
            })),
          };
        }
        throw new Error(`unexpected table: ${table}`);
      }),
      rpc: vi.fn(async () => ({ data: null, error: null })),
    } as unknown as SupabaseClient;

    await handleChargeFailed(
      {
        event: "charge.failed",
        data: {
          reference: "txn_renew_fail",
          message: "Declined",
          gateway_response: "Declined",
          amount: 5000,
          fees: 100,
          subscription: { subscription_code: "SUB_abc" },
          metadata: {},
        },
      } as unknown as PaystackEvent,
      mockSupabase,
    );

    expect(subscriptionUpdates).toHaveLength(1);
    expect(subscriptionUpdates[0]?.status).toBe("past_due");
    expect(typeof subscriptionUpdates[0]?.last_dunning_retry_at).toBe("string");
    expect(subscriptionUpdates[0]?.past_due_since).toBe(subscriptionUpdates[0]?.last_dunning_retry_at);
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
                  eq: vi.fn(async () => ({ error: null })),
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

  it("records a failed invoice so the retry waits a day", async () => {
    const subscriptionUpdates: Array<Record<string, unknown>> = [];
    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === "payment_transactions") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                  })),
                })),
              })),
            })),
            insert: vi.fn(() => Promise.resolve({ error: null })),
          };
        }
        if (table === "provider_subscriptions") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                single: vi.fn(async () => ({
                  data: { provider_id: "provider-1", plan_id: "plan-1", status: "active" },
                  error: null,
                })),
              })),
            })),
            update: vi.fn((values: Record<string, unknown>) => {
              subscriptionUpdates.push(values);
              return { eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })), in: vi.fn(async () => ({ error: null })) })) };
            }),
          };
        }
        if (table === "providers") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: null, error: null })),
              })),
            })),
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
          invoice_code: "INV_fail",
          amount: 5000,
          fees: 100,
        },
      } as unknown as PaystackEvent,
      mockSupabase,
    );

    expect(subscriptionUpdates).toHaveLength(1);
    expect(subscriptionUpdates[0]?.status).toBe("past_due");
    expect(typeof subscriptionUpdates[0]?.last_dunning_retry_at).toBe("string");
    expect(subscriptionUpdates[0]?.past_due_since).toBe(subscriptionUpdates[0]?.last_dunning_retry_at);
  });

  it("leaves the past-due grace date alone when another invoice fails", async () => {
    const subscriptionUpdates: Array<Record<string, unknown>> = [];
    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === "payment_transactions") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                  })),
                })),
              })),
            })),
            insert: vi.fn(() => Promise.resolve({ error: null })),
          };
        }
        if (table === "provider_subscriptions") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                single: vi.fn(async () => ({
                  data: { provider_id: "provider-1", plan_id: "plan-1", status: "past_due" },
                  error: null,
                })),
              })),
            })),
            update: vi.fn((values: Record<string, unknown>) => {
              subscriptionUpdates.push(values);
              return { eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })), in: vi.fn(async () => ({ error: null })) })) };
            }),
          };
        }
        if (table === "providers") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: null, error: null })),
              })),
            })),
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
          invoice_code: "INV_again",
          amount: 5000,
          fees: 100,
        },
      } as unknown as PaystackEvent,
      mockSupabase,
    );

    expect(subscriptionUpdates).toHaveLength(0);
  });

  it("does not restart past-due grace when Paystack creates the next invoice", async () => {
    const subscriptionUpdates: Array<Record<string, unknown>> = [];
    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === "provider_subscriptions") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                single: vi.fn(async () => ({
                  data: { provider_id: "provider-1", plan_id: "plan-1", status: "past_due" },
                  error: null,
                })),
              })),
            })),
            update: vi.fn((values: Record<string, unknown>) => {
              subscriptionUpdates.push(values);
              return {
                eq: vi.fn(() => {
                  const result = Promise.resolve({ error: null });
                  return Object.assign(result, { eq: vi.fn(async () => ({ error: null })) });
                }),
              };
            }),
          };
        }
        throw new Error(`unexpected table: ${table}`);
      }),
    } as unknown as SupabaseClient;

    await handleSubscriptionEvent(
      {
        event: "invoice.create",
        data: {
          subscription: { subscription_code: "SUB_abc" },
          due_date: "2026-12-01T00:00:00.000Z",
        },
      } as unknown as PaystackEvent,
      mockSupabase,
    );

    expect(subscriptionUpdates).toHaveLength(1);
    expect(subscriptionUpdates[0]?.updated_at).toBeUndefined();
    expect(subscriptionUpdates[0]?.next_payment_date).toBe("2026-12-01T00:00:00.000Z");
  });

  it("invoice.update starts past-due grace once and does not move it later", async () => {
    const subscriptionUpdates: Array<Record<string, unknown>> = [];
    const status = { current: "active" };
    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === "payment_transactions") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                  })),
                })),
              })),
            })),
          };
        }
        if (table === "provider_subscriptions") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                single: vi.fn(async () => ({
                  data: { provider_id: "provider-1", plan_id: "plan-1", status: status.current },
                  error: null,
                })),
              })),
            })),
            update: vi.fn((values: Record<string, unknown>) => {
              subscriptionUpdates.push(values);
              return {
                eq: vi.fn(() => {
                  const result = Promise.resolve({ error: null });
                  return Object.assign(result, {
                    eq: vi.fn(async () => ({ error: null })),
                  });
                }),
              };
            }),
          };
        }
        throw new Error(`unexpected table: ${table}`);
      }),
    } as unknown as SupabaseClient;

    const failedInvoice = {
      event: "invoice.update",
      data: {
        subscription: { subscription_code: "SUB_abc" },
        invoice_code: "INV_upd",
        status: "failed",
        amount: 5000,
        fees: 100,
      },
    } as unknown as PaystackEvent;

    await handleSubscriptionEvent(failedInvoice, mockSupabase);
    expect(subscriptionUpdates).toHaveLength(1);
    expect(subscriptionUpdates[0]?.status).toBe("past_due");
    expect(subscriptionUpdates[0]?.past_due_since).toBe(subscriptionUpdates[0]?.last_dunning_retry_at);

    status.current = "past_due";
    await handleSubscriptionEvent(failedInvoice, mockSupabase);
    expect(subscriptionUpdates).toHaveLength(1);
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
    const steps: string[] = [];
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
              steps.push("payment");
              return Promise.resolve({ error: null });
            }),
          };
        }
        if (table === "provider_subscriptions") {
          const subRow = {
            id: "sub-row-1",
            billing_period: "monthly",
            plan_id: "plan-1",
            provider_id: "provider-1",
            tenant_id: "tenant-1",
            billing_provider: "paystack",
            status: "active",
            paystack_subscription_code: "SUB_abc",
            plan: { is_free: false },
          };
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: subRow, error: null })),
                single: vi.fn(async () => ({ data: subRow, error: null })),
              })),
            })),
            update: vi.fn((values: Record<string, unknown>) => {
              subscriptionUpdates.push(values);
              if (values.status === "active") steps.push("active");
              return {
                eq: vi.fn(() => {
                  const result = Promise.resolve({ error: null });
                  return Object.assign(result, {
                    eq: vi.fn(async () => ({ error: null })),
                    in: vi.fn(() => ({
                      select: vi.fn(async () => ({ data: [{ id: "sub-row-1" }], error: null })),
                    })),
                  });
                }),
              };
            }),
          };
        }
        if (table === "finance_transactions") {
          const lookup = {
            eq: () => lookup,
            contains: () => lookup,
            maybeSingle: async () => ({ data: null, error: null }),
          };
          return {
            select: () => lookup,
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
    expect(steps.indexOf("payment")).toBeGreaterThanOrEqual(0);
    expect(steps.indexOf("payment")).toBeLessThan(steps.indexOf("active"));
    expect(financeInserts.length).toBeGreaterThanOrEqual(1);
  });
});
