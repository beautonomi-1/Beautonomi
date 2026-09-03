import { describe, expect, it, vi, beforeEach } from "vitest";
import { recordSuccessfulProviderSubscriptionRenewalFromInvoice } from "../subscription-events";
import type { SupabaseClient } from "../shared";

vi.mock("@/lib/finance/resolve-tenant-id-for-ledger", () => ({
  resolveTenantIdForFinanceLedger: vi.fn(async () => "tenant-ledger"),
}));

vi.mock("@/lib/regions/config", () => ({
  getTenantRegionConfig: vi.fn(async () => ({ defaultCurrency: "ZAR" })),
}));

vi.mock("@/lib/notifications/onesignal", () => ({
  sendTemplateNotification: vi.fn(async () => undefined),
}));

function createRenewalTestSupabase(options: { existingPaymentTx: boolean }) {
  const paymentInserts: unknown[] = [];
  const financeInserts: unknown[] = [];
  const subscriptionUpdates: unknown[] = [];

  const mockSupabase = {
    from: vi.fn((table: string) => {
      if (table === "payment_transactions") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: options.existingPaymentTx ? { id: "already-recorded" } : null,
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
              single: vi.fn(async () => ({
                data: {
                  billing_period: "monthly",
                  plan_id: "11111111-1111-4111-8111-111111111111",
                  provider_id: "22222222-2222-4222-8222-222222222222",
                  tenant_id: "tenant-za",
                },
                error: null,
              })),
            })),
          })),
          update: vi.fn((row: unknown) => {
            subscriptionUpdates.push(row);
            return {
              eq: vi.fn(() => Promise.resolve({ error: null })),
            };
          }),
        };
      }
      if (table === "subscription_plans") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: {
                  name: "Test Plan",
                  currency: "ZAR",
                  price_monthly: 50,
                  price_yearly: 500,
                },
                error: null,
              })),
            })),
          })),
        };
      }
      if (table === "providers") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: { user_id: null, business_name: "Test Co", tenant_id: "tenant-za" },
                error: null,
              })),
            })),
          })),
        };
      }
      if (table === "finance_transactions") {
        return {
          // recordProviderSubscriptionPayment chains .insert().select("id").single()
          // to capture the finance_transactions.id for the receipt email.
          insert: vi.fn((row: unknown) => {
            financeInserts.push(row);
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: { id: "finance-tx-1" },
                  error: null,
                })),
              })),
            };
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    }),
  };

  return { mockSupabase: mockSupabase as unknown as SupabaseClient, paymentInserts, financeInserts, subscriptionUpdates };
}

describe("recordSuccessfulProviderSubscriptionRenewalFromInvoice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("inserts payment + finance rows and updates subscription when no prior payment tx", async () => {
    const { mockSupabase, paymentInserts, financeInserts, subscriptionUpdates } = createRenewalTestSupabase({
      existingPaymentTx: false,
    });

    await recordSuccessfulProviderSubscriptionRenewalFromInvoice(mockSupabase, {
      subscriptionCode: "SUB_testcode",
      invoiceCode: "INV_testinv",
      amount: 10_000,
      fees: 200,
      paidAt: "2026-01-15T12:00:00.000Z",
      payload: {},
      providerId: "22222222-2222-4222-8222-222222222222",
    });

    // 1) renewal handler reactivates + extends expiry; 2) payment recorder stamps the billing period.
    expect(subscriptionUpdates).toHaveLength(2);
    expect((subscriptionUpdates[0] as { status?: string }).status).toBe("active");
    const periodUpdate = subscriptionUpdates[1] as { billing_period_start?: string; billing_period_end?: string };
    expect(periodUpdate.billing_period_start).toBeTruthy();
    expect(periodUpdate.billing_period_end).toBeTruthy();

    expect(paymentInserts).toHaveLength(1);
    const payRow = paymentInserts[0] as { reference?: string; net_amount?: number; status?: string };
    expect(payRow.reference).toBe("INV_testinv");
    expect(payRow.status).toBe("success");
    expect(payRow.net_amount).toBe(98);

    expect(financeInserts).toHaveLength(1);
    const finRow = financeInserts[0] as {
      tenant_id?: string;
      transaction_type?: string;
      amount?: number;
      fees?: number;
      net?: number;
      metadata?: { recognition_basis?: string; term_start?: string; term_end?: string };
    };
    expect(finRow.tenant_id).toBe("tenant-ledger");
    expect(finRow.transaction_type).toBe("provider_subscription_payment");
    // Accrual basis: cash is posted as deferred revenue (net = 0); the
    // recognize-period-revenue cron releases it ratably over the term.
    expect(finRow.amount).toBe(100);
    expect(finRow.fees).toBe(2);
    expect(finRow.net).toBe(0);
    expect(finRow.metadata?.recognition_basis).toBe("term");
    expect(finRow.metadata?.term_start).toBeTruthy();
    expect(finRow.metadata?.term_end).toBeTruthy();
  });

  it("skips inserts when payment_transactions already exists for invoice reference (idempotent)", async () => {
    const { mockSupabase, paymentInserts, financeInserts, subscriptionUpdates } = createRenewalTestSupabase({
      existingPaymentTx: true,
    });

    await recordSuccessfulProviderSubscriptionRenewalFromInvoice(mockSupabase, {
      subscriptionCode: "SUB_testcode",
      invoiceCode: "INV_dup",
      amount: 10_000,
      fees: 0,
      paidAt: "2026-02-01T00:00:00.000Z",
      payload: {},
      providerId: "22222222-2222-4222-8222-222222222222",
    });

    expect(subscriptionUpdates).toHaveLength(0);
    expect(paymentInserts).toHaveLength(0);
    expect(financeInserts).toHaveLength(0);
  });
});
