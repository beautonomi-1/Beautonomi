import { describe, expect, it } from "vitest";
import {
  applyInvoiceStatusFilter,
  computeInvoiceSummary,
  exportableInvoiceAmountDue,
  withEffectiveStatus,
} from "@/lib/invoices/provider-invoices-query";

describe("provider invoice query helpers", () => {
  const today = "2026-10-26";

  it("marks sent past-due rows as overdue via effective_status", () => {
    const row = withEffectiveStatus(
      {
        status: "sent",
        due_date: "2026-10-01",
        total_amount: 100,
        amount_paid: 0,
        amount_due: 100,
      },
      today,
    );
    expect(row.effective_status).toBe("overdue");
  });

  it("exportableInvoiceAmountDue is zero for cancelled platform_fee", () => {
    expect(
      exportableInvoiceAmountDue(
        {
          invoice_type: "platform_fee",
          status: "cancelled",
          total_amount: 500,
          amount_paid: 0,
          amount_due: 500,
        },
        today,
      ),
    ).toBe(0);
  });

  it("summary excludes non-payable platform_fee invoices from outstanding", () => {
    const summary = computeInvoiceSummary(
      [
        {
          invoice_type: "platform_fee",
          status: "sent",
          due_date: "2026-10-01",
          total_amount: 999,
          amount_paid: 0,
          amount_due: 999,
        },
        {
          invoice_type: "other",
          status: "sent",
          due_date: "2026-11-01",
          total_amount: 40,
          amount_paid: 0,
          amount_due: 40,
        },
      ],
      today,
    );
    expect(summary.outstanding_amount).toBe(40);
    expect(summary.overdue_count).toBe(0);
  });

  it("summary totals ignore list status chip and use effective overdue", () => {
    const summary = computeInvoiceSummary(
      [
        {
          invoice_type: "other",
          status: "sent",
          due_date: "2026-10-01",
          total_amount: 200,
          amount_paid: 50,
          amount_due: 150,
        },
        { invoice_type: "other", status: "paid", total_amount: 80, amount_paid: 80, amount_due: 0 },
      ],
      today,
    );
    expect(summary.outstanding_amount).toBe(150);
    expect(summary.overdue_count).toBe(1);
    expect(summary.paid_amount).toBe(130);
  });

  it("applyInvoiceStatusFilter exposes open filter hook", () => {
    const calls: string[] = [];
    const chain = {
      in: (...args: unknown[]) => {
        calls.push(`in:${String(args[0])}`);
        return chain;
      },
      gt: (...args: unknown[]) => {
        calls.push(`gt:${String(args[0])}`);
        return chain;
      },
      or: (...args: unknown[]) => {
        calls.push(`or:${String(args[0])}`);
        return chain;
      },
      eq: (...args: unknown[]) => {
        calls.push(`eq:${String(args[0])}`);
        return chain;
      },
      not: (...args: unknown[]) => {
        calls.push(`not:${String(args[0])}`);
        return chain;
      },
    };
    applyInvoiceStatusFilter(chain as never, "open", today);
    expect(calls[0]).toContain("in:");
    expect(calls.some((c) => c.startsWith("not:"))).toBe(true);
    applyInvoiceStatusFilter(chain as never, "overdue", today);
    expect(calls.some((c) => c.startsWith("or:"))).toBe(true);
  });
});