import { describe, expect, it } from "vitest";
import { buildProviderInvoiceLineItems } from "../build-provider-invoice-line-items";

const ledger = [
  // Fee on a cash booking: the platform never held the money → owed by provider.
  { id: "ft-1", transaction_type: "platform_fee", amount: 15, booking_id: "b-cash", created_at: "2026-08-02T10:00:00Z", metadata: {} },
  { id: "ft-2", transaction_type: "commission", amount: 37.5, booking_id: "b-cash", created_at: "2026-08-02T10:00:00Z", metadata: {} },
  // Fee on an online booking: retained at checkout → never invoiced.
  { id: "ft-3", transaction_type: "platform_fee", amount: 15, booking_id: "b-online", created_at: "2026-08-03T10:00:00Z", metadata: {} },
  // Already invoiced → skipped.
  { id: "ft-4", transaction_type: "platform_fee", amount: 15, booking_id: "b-cash-2", created_at: "2026-08-04T10:00:00Z", metadata: { provider_invoice_id: "inv-old" } },
  // Ad-hoc charge explicitly tagged for an "other" invoice.
  { id: "ft-5", transaction_type: "adjustment", amount: 120.004, booking_id: null, created_at: "2026-08-05T10:00:00Z", description: "Signage reprint", metadata: { provider_invoice_type: "other" } },
];

const paymentsByBooking = {
  "b-cash": ["cash"],
  "b-cash-2": ["yoco"],
  "b-online": ["paystack"],
};

describe("buildProviderInvoiceLineItems (F2-42)", () => {
  it("builds transaction_fee lines from fee/commission ledger rows on provider-collected bookings", () => {
    const { lineItems, subtotal } = buildProviderInvoiceLineItems({
      invoiceType: "transaction_fee",
      ledgerRows: ledger,
      paymentProvidersByBooking: paymentsByBooking,
      bookingRefs: { "b-cash": "BK-100" },
    });
    expect(lineItems.map((l) => l.reference_id)).toEqual(["ft-1", "ft-2"]);
    expect(lineItems[0]).toMatchObject({
      line_item_type: "platform_fee",
      quantity: 1,
      unit_price: 15,
      total_price: 15,
      reference_type: "finance_transaction",
    });
    expect(lineItems[0]!.description).toContain("BK-100");
    expect(subtotal).toBe(52.5);
  });

  it("builds 'other' lines only from ledger rows explicitly tagged for that invoice type, rounded to cents", () => {
    const { lineItems, subtotal } = buildProviderInvoiceLineItems({
      invoiceType: "other",
      ledgerRows: ledger,
      paymentProvidersByBooking: paymentsByBooking,
      bookingRefs: {},
    });
    expect(lineItems).toHaveLength(1);
    expect(lineItems[0]).toMatchObject({ reference_id: "ft-5", total_price: 120, description: "Signage reprint" });
    expect(subtotal).toBe(120);
  });

  it("returns no lines for non-payable or empty inputs", () => {
    expect(
      buildProviderInvoiceLineItems({
        invoiceType: "platform_fee",
        ledgerRows: ledger,
        paymentProvidersByBooking: paymentsByBooking,
        bookingRefs: {},
      }).lineItems,
    ).toEqual([]);
    expect(
      buildProviderInvoiceLineItems({
        invoiceType: "transaction_fee",
        ledgerRows: [],
        paymentProvidersByBooking: {},
        bookingRefs: {},
      }).subtotal,
    ).toBe(0);
  });
});
