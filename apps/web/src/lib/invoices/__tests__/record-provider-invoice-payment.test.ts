import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordProviderInvoicePayment } from "../record-provider-invoice-payment";

function makeSupabase(opts: {
  existingRef?: { invoice_id: string; amount: number } | null;
  invoice?: Record<string, unknown> | null;
  insertError?: { code?: string } | null;
}) {
  const payments: Record<string, unknown> = {};
  payments.select = vi.fn(() => payments);
  payments.eq = vi.fn(() => payments);
  payments.maybeSingle = vi.fn(() =>
    Promise.resolve({ data: opts.existingRef ?? null, error: null }),
  );
  payments.insert = vi.fn(() =>
    Promise.resolve({ error: opts.insertError ?? null }),
  );

  const invoices: Record<string, unknown> = {};
  invoices.select = vi.fn(() => invoices);
  invoices.eq = vi.fn(() => invoices);
  invoices.maybeSingle = vi.fn(() =>
    Promise.resolve({ data: opts.invoice ?? null, error: null }),
  );

  return {
    from: vi.fn((table: string) => {
      if (table === "provider_invoice_payments") return payments;
      if (table === "provider_invoices") return invoices;
      throw new Error(`unexpected table ${table}`);
    }),
  };
}

describe("recordProviderInvoicePayment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns applied:false when payment_reference already exists (terminal/webhook retry)", async () => {
    const supabase = makeSupabase({
      existingRef: { invoice_id: "inv-1", amount: 50 },
    });

    const result = await recordProviderInvoicePayment({
      supabase: supabase as never,
      invoiceId: "inv-1",
      amount: 50,
      paymentReference: "TERM-REF-1",
    });

    expect(result.applied).toBe(false);
    expect(result.invoiceId).toBe("inv-1");
    expect(result.amountApplied).toBe(50);
    const payments = supabase.from("provider_invoice_payments") as { insert: ReturnType<typeof vi.fn> };
    expect(payments.insert).not.toHaveBeenCalled();
  });

  it("inserts completed payment when reference is new", async () => {
    const supabase = makeSupabase({
      invoice: {
        id: "inv-1",
        provider_id: "prov-1",
        total_amount: 100,
        amount_paid: 0,
        status: "sent",
      },
    });

    const result = await recordProviderInvoicePayment({
      supabase: supabase as never,
      invoiceId: "inv-1",
      amount: 40,
      paymentReference: "TERM-REF-2",
    });

    expect(result.applied).toBe(true);
    const payments = supabase.from("provider_invoice_payments") as { insert: ReturnType<typeof vi.fn> };
    expect(payments.insert).toHaveBeenCalled();
  });

  it("rejects payment on open platform_fee invoice", async () => {
    const supabase = makeSupabase({
      invoice: {
        id: "inv-fee",
        provider_id: "prov-1",
        invoice_type: "platform_fee",
        total_amount: 100,
        amount_paid: 0,
        status: "sent",
      },
    });

    await expect(
      recordProviderInvoicePayment({
        supabase: supabase as never,
        invoiceId: "inv-fee",
        amount: 40,
        paymentReference: "PSK-1",
      }),
    ).rejects.toThrow(/cannot accept payment/i);
  });

  it("allows payment on cancelled platform_fee invoice (post-cutoff charge / refund review)", async () => {
    const supabase = makeSupabase({
      invoice: {
        id: "inv-fee",
        provider_id: "prov-1",
        invoice_type: "platform_fee",
        total_amount: 100,
        amount_paid: 0,
        status: "cancelled",
      },
    });

    const result = await recordProviderInvoicePayment({
      supabase: supabase as never,
      invoiceId: "inv-fee",
      amount: 100,
      paymentReference: "PSK-LATE",
    });
    expect(result.applied).toBe(true);
  });
});
