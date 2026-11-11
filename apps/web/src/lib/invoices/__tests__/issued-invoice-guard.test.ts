import { describe, expect, it } from "vitest";
import {
  INVOICE_FINANCIAL_FIELDS,
  isIssuedInvoiceStatus,
  rejectedFinancialFieldsForIssuedInvoice,
} from "../issued-invoice-guard";

describe("issued invoice immutability (F2-44)", () => {
  it("treats every non-draft status as issued", () => {
    expect(isIssuedInvoiceStatus("draft")).toBe(false);
    for (const s of ["sent", "paid", "partially_paid", "overdue", "cancelled", "refunded"]) {
      expect(isIssuedInvoiceStatus(s)).toBe(true);
    }
  });

  it("allows only status transitions and notes on issued invoices", () => {
    expect(rejectedFinancialFieldsForIssuedInvoice("sent", { status: "cancelled", notes: "void" })).toEqual([]);
    expect(rejectedFinancialFieldsForIssuedInvoice("paid", { notes: null })).toEqual([]);
  });

  it("rejects financial fields on issued/paid invoices", () => {
    expect(
      rejectedFinancialFieldsForIssuedInvoice("sent", {
        line_items: [{ description: "x", unit_price: 1, quantity: 1 }],
        tax_rate: 0,
        notes: "ok",
      }),
    ).toEqual(["line_items", "tax_rate"]);
    expect(rejectedFinancialFieldsForIssuedInvoice("paid", { due_date: "2026-01-01" })).toEqual(["due_date"]);
    expect(rejectedFinancialFieldsForIssuedInvoice("overdue", { invoice_type: "other", period_start: "2026-01-01" })).toEqual([
      "invoice_type",
      "period_start",
    ]);
  });

  it("does not restrict drafts", () => {
    expect(rejectedFinancialFieldsForIssuedInvoice("draft", { tax_rate: 15, line_items: [] })).toEqual([]);
  });

  it("documents the protected field set", () => {
    expect([...INVOICE_FINANCIAL_FIELDS].sort()).toEqual(
      ["description", "due_date", "invoice_type", "issue_date", "line_items", "period_end", "period_start", "tax_rate"].sort(),
    );
  });
});
