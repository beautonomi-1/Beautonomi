import { describe, expect, it } from "vitest";
import {
  applyInvoiceStatusFilter,
  computeInvoiceSummary,
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

  it("summary totals ignore list status chip and use effective overdue", () => {
    const summary = computeInvoiceSummary(
      [
        {
          status: "sent",
          due_date: "2026-10-01",
          total_amount: 200,
          amount_paid: 50,
          amount_due: 150,
        },
        { status: "paid", total_amount: 80, amount_paid: 80, amount_due: 0 },
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
    };
    applyInvoiceStatusFilter(chain as never, "open", today);
    expect(calls[0]).toContain("in:");
    applyInvoiceStatusFilter(chain as never, "overdue", today);
    expect(calls.some((c) => c.startsWith("or:"))).toBe(true);
  });
});
