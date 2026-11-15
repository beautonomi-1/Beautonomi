import { describe, expect, it, vi, beforeEach } from "vitest";
import { recordSuccessfulProviderSubscriptionRenewalFromInvoice } from "../subscription-events";
import { computePaidPeriodExpiresAt } from "@/lib/subscriptions/provider-billing-merchant";
import type { SupabaseClient } from "../shared";

const createRefund = vi.fn(async () => ({ status: true, message: "ok", data: {} }));
vi.mock("@/lib/payments/paystack-complete", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/payments/paystack-complete")>();
  return { ...actual, createRefund: (...args: unknown[]) => createRefund(...args) };
});

vi.mock("@/lib/finance/resolve-tenant-id-for-ledger", () => ({
  resolveTenantIdForFinanceLedger: vi.fn(async () => "tenant-ledger"),
}));

vi.mock("@/lib/regions/config", () => ({
  getTenantRegionConfig: vi.fn(async () => ({ defaultCurrency: "ZAR" })),
}));

vi.mock("@/lib/notifications/onesignal", () => ({
  sendTemplateNotification: vi.fn(async () => undefined),
}));

function createRenewalTestSupabase(options: {
  existingPaymentTx: boolean;
  existingPaymentStatus?: string;
  expiresAt?: string | null;
  priorFinancePayment?: boolean;
}) {
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
                  data: options.existingPaymentTx
                    ? {
                        id: "already-recorded",
                        status: options.existingPaymentStatus,
                      }
                    : null,
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
        const subRow = {
          id: "sub-row-1",
          billing_period: "monthly",
          plan_id: "11111111-1111-4111-8111-111111111111",
          provider_id: "22222222-2222-4222-8222-222222222222",
          tenant_id: "tenant-za",
          billing_provider: "paystack",
          status: "active",
          paystack_subscription_code: "SUB_testcode",
          plan: { is_free: false },
          expires_at: options.expiresAt ?? null,
        };
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: subRow, error: null })),
              single: vi.fn(async () => ({
                data: subRow,
                error: null,
              })),
            })),
          })),
          update: vi.fn((row: unknown) => {
            subscriptionUpdates.push(row);
            const result = { data: [{ id: "sub-row-1" }], error: null };
            const chain = {
              eq: () => chain,
              in: () => chain,
              select: () => Promise.resolve(result),
              then: (
                resolve: (value: typeof result) => unknown,
                reject?: (reason: unknown) => unknown,
              ) => Promise.resolve(result).then(resolve, reject),
            };
            return chain;
          }),
        };
      }
      if (table === "subscription_plans") {
        const planData = {
          name: "Test Plan",
          currency: "ZAR",
          price_monthly: 50,
          price_yearly: 500,
          is_free: false,
        };
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({ data: planData, error: null })),
              maybeSingle: vi.fn(async () => ({ data: planData, error: null })),
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
              maybeSingle: vi.fn(async () => ({
                data: { user_id: null, business_name: "Test Co", tenant_id: "tenant-za" },
                error: null,
              })),
            })),
          })),
        };
      }
      if (table === "finance_transactions") {
        const api = {
          select: () => api,
          eq: () => api,
          contains: () => api,
          maybeSingle: async () => ({
            data: options.priorFinancePayment ? { id: "prior-fin" } : null,
            error: null,
          }),
          insert: (row: unknown) => {
            financeInserts.push(row);
            return {
              select: () => ({
                single: async () => ({
                  data: { id: "finance-tx-1" },
                  error: null,
                }),
              }),
            };
          },
        };
        return api;
      }
      throw new Error(`unexpected table: ${table}`);
    }),
    rpc: async () => ({ data: 0, error: null }),
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

    // The payment record does not move the billing window. The renewal opens it.
    expect(subscriptionUpdates).toHaveLength(1);
    const periodUpdate = subscriptionUpdates[0] as {
      status?: string;
      expires_at?: string;
      billing_period_start?: string;
      billing_period_end?: string;
    };
    expect(periodUpdate.status).toBe("active");
    expect(periodUpdate.billing_period_start).toBe("2026-01-15T12:00:00.000Z");
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
    expect(finRow.metadata?.term_end).toBe(
      computePaidPeriodExpiresAt("monthly", new Date(String(finRow.metadata?.term_start))),
    );
    expect(periodUpdate.billing_period_end).toBe(finRow.metadata?.term_end);
    expect(periodUpdate.expires_at).toBe(finRow.metadata?.term_end);
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

    expect(subscriptionUpdates).toHaveLength(1);
    expect((subscriptionUpdates[0] as { status?: string }).status).toBe("active");
    expect(paymentInserts).toHaveLength(0);
    expect(financeInserts).toHaveLength(0);
  });

  it("leaves the end date when that charge's period is already applied", async () => {
    const paidAt = "2026-02-01T00:00:00.000Z";
    const appliedEnd = computePaidPeriodExpiresAt("monthly", new Date(paidAt));
    const { mockSupabase, subscriptionUpdates } = createRenewalTestSupabase({
      existingPaymentTx: true,
      expiresAt: appliedEnd,
    });

    await recordSuccessfulProviderSubscriptionRenewalFromInvoice(mockSupabase, {
      subscriptionCode: "SUB_testcode",
      invoiceCode: "INV_dup",
      amount: 10_000,
      fees: 0,
      paidAt,
      payload: {},
      providerId: "22222222-2222-4222-8222-222222222222",
    });

    expect(subscriptionUpdates).toHaveLength(0);
  });

  it("adds the next period after an open term when the invoice has no next charge date", async () => {
    const paidAt = new Date();
    paidAt.setUTCDate(paidAt.getUTCDate() - 10);
    const openUntil = new Date();
    openUntil.setUTCDate(openUntil.getUTCDate() + 10);
    const { mockSupabase, subscriptionUpdates } = createRenewalTestSupabase({
      existingPaymentTx: false,
      expiresAt: openUntil.toISOString(),
    });

    await recordSuccessfulProviderSubscriptionRenewalFromInvoice(mockSupabase, {
      subscriptionCode: "SUB_testcode",
      invoiceCode: "INV_open",
      amount: 10_000,
      fees: 0,
      paidAt: paidAt.toISOString(),
      payload: {},
      providerId: "22222222-2222-4222-8222-222222222222",
    });

    const periodUpdate = subscriptionUpdates.find(
      (row) => (row as { expires_at?: string }).expires_at,
    ) as { expires_at?: string; billing_period_start?: string };
    expect(periodUpdate.billing_period_start).toBe(openUntil.toISOString());
    expect(periodUpdate.expires_at).toBe(computePaidPeriodExpiresAt("monthly", openUntil));
  });

  it("leaves the end date when the invoice next charge date is already applied", async () => {
    const nextPaymentDate = "2026-03-01T00:00:00.000Z";
    const { mockSupabase, subscriptionUpdates } = createRenewalTestSupabase({
      existingPaymentTx: true,
      expiresAt: nextPaymentDate,
    });

    await recordSuccessfulProviderSubscriptionRenewalFromInvoice(mockSupabase, {
      subscriptionCode: "SUB_testcode",
      invoiceCode: "INV_dup",
      amount: 10_000,
      fees: 0,
      paidAt: "2026-02-01T00:00:00.000Z",
      payload: { next_payment_date: nextPaymentDate },
      providerId: "22222222-2222-4222-8222-222222222222",
    });

    expect(subscriptionUpdates).toHaveLength(0);
  });

  it("returns a second charge when that period is already paid", async () => {
    const nextPaymentDate = "2026-03-01T00:00:00.000Z";
    const { mockSupabase, paymentInserts, subscriptionUpdates } = createRenewalTestSupabase({
      existingPaymentTx: false,
      expiresAt: nextPaymentDate,
      priorFinancePayment: true,
    });

    await recordSuccessfulProviderSubscriptionRenewalFromInvoice(mockSupabase, {
      subscriptionCode: "SUB_testcode",
      invoiceCode: "INV_extra",
      amount: 10_000,
      fees: 200,
      paidAt: "2026-02-01T00:00:00.000Z",
      payload: { next_payment_date: nextPaymentDate, transaction: { reference: "ref-extra" } },
      providerId: "22222222-2222-4222-8222-222222222222",
    });

    expect(createRefund).toHaveBeenCalledWith(
      {
        transaction: "ref-extra",
        merchant_note: "This period was already paid. The extra renewal charge was returned.",
      },
      { tenantId: "tenant-za" },
    );
    expect(paymentInserts).toEqual([
      expect.objectContaining({ reference: "ref-extra", status: "refunded" }),
    ]);
    expect(subscriptionUpdates).toHaveLength(0);
  });

  it("leaves a returned charge returned when Paystack says it was already refunded", async () => {
    createRefund.mockRejectedValueOnce(new Error("Transaction has been fully refunded"));
    const nextPaymentDate = "2026-03-01T00:00:00.000Z";
    const { mockSupabase, paymentInserts, subscriptionUpdates } = createRenewalTestSupabase({
      existingPaymentTx: false,
      expiresAt: nextPaymentDate,
      priorFinancePayment: true,
    });

    await recordSuccessfulProviderSubscriptionRenewalFromInvoice(mockSupabase, {
      subscriptionCode: "SUB_testcode",
      invoiceCode: "INV_extra",
      amount: 10_000,
      fees: 200,
      paidAt: "2026-02-01T00:00:00.000Z",
      payload: { next_payment_date: nextPaymentDate, transaction: { reference: "ref-extra" } },
      providerId: "22222222-2222-4222-8222-222222222222",
    });

    expect(paymentInserts).toEqual([
      expect.objectContaining({ reference: "ref-extra", status: "refunded" }),
    ]);
    expect(subscriptionUpdates).toHaveLength(0);
  });

  it("does not open a new period for a charge that was already returned", async () => {
    const { mockSupabase, paymentInserts, subscriptionUpdates } = createRenewalTestSupabase({
      existingPaymentTx: true,
      existingPaymentStatus: "refunded",
      expiresAt: "2020-01-01T00:00:00.000Z",
    });

    await recordSuccessfulProviderSubscriptionRenewalFromInvoice(mockSupabase, {
      subscriptionCode: "SUB_testcode",
      invoiceCode: "INV_extra",
      amount: 10_000,
      fees: 200,
      paidAt: "2026-02-01T00:00:00.000Z",
      payload: { transaction: { reference: "ref-extra" } },
      providerId: "22222222-2222-4222-8222-222222222222",
    });

    expect(createRefund).not.toHaveBeenCalled();
    expect(paymentInserts).toHaveLength(0);
    expect(subscriptionUpdates).toHaveLength(0);
  });

  it("records the charge when the duplicate refund cannot be sent", async () => {
    createRefund.mockRejectedValueOnce(new Error("Paystack secret key not configured"));
    const nextPaymentDate = "2026-03-01T00:00:00.000Z";
    const { mockSupabase, paymentInserts, subscriptionUpdates } = createRenewalTestSupabase({
      existingPaymentTx: false,
      expiresAt: nextPaymentDate,
      priorFinancePayment: true,
    });

    await recordSuccessfulProviderSubscriptionRenewalFromInvoice(mockSupabase, {
      subscriptionCode: "SUB_testcode",
      invoiceCode: "INV_extra",
      amount: 10_000,
      fees: 200,
      paidAt: "2026-02-01T00:00:00.000Z",
      payload: { next_payment_date: nextPaymentDate, transaction: { reference: "ref-kept" } },
      providerId: "22222222-2222-4222-8222-222222222222",
    });

    expect(paymentInserts).toEqual([
      expect.objectContaining({ reference: "ref-kept", status: "success" }),
    ]);
    expect(subscriptionUpdates).toHaveLength(0);
  });

  it("books the first charge when the period was opened before the payment", async () => {
    const nextPaymentDate = "2026-12-15T00:00:00.000Z";
    const { mockSupabase, paymentInserts, subscriptionUpdates } = createRenewalTestSupabase({
      existingPaymentTx: false,
      expiresAt: nextPaymentDate,
    });

    await recordSuccessfulProviderSubscriptionRenewalFromInvoice(mockSupabase, {
      subscriptionCode: "SUB_testcode",
      invoiceCode: "INV_first",
      amount: 10_000,
      fees: 200,
      paidAt: "2026-11-15T00:00:00.000Z",
      payload: { next_payment_date: nextPaymentDate, transaction: { reference: "ref-first" } },
      providerId: "22222222-2222-4222-8222-222222222222",
    });

    expect(createRefund).not.toHaveBeenCalled();
    expect(paymentInserts).toEqual([
      expect.objectContaining({ reference: "ref-first", status: "success" }),
    ]);
    expect(subscriptionUpdates).toHaveLength(0);
  });
});
