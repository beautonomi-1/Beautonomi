import { roundCurrency, sumMoney } from "@beautonomi/utils";
import { PLATFORM_HELD_PAYMENT_PROVIDERS } from "@/lib/provider/available-payout-balance";

export interface ProviderInvoiceLineItem {
  line_item_type: string;
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  reference_type: string | null;
  reference_id: string | null;
  metadata: Record<string, unknown>;
}

export type InvoiceLedgerRow = {
  id: string;
  transaction_type: string | null;
  amount: number | string | null;
  booking_id?: string | null;
  created_at?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
};

/** Ledger types that represent a platform charge on a booking. */
export const PROVIDER_FEE_LEDGER_TYPES = ["platform_fee", "commission"] as const;

/** Explicit opt-in tag for ad-hoc ledger rows that should be billed on an `other` invoice. */
export const OTHER_INVOICE_LEDGER_TAG = "other";

function isProviderCollected(paymentProviders: string[] | undefined): boolean {
  if (!paymentProviders || paymentProviders.length === 0) return false;
  // If any leg was held by the platform the fee was retained at checkout.
  return !paymentProviders.some((p) => PLATFORM_HELD_PAYMENT_PROVIDERS.has(String(p || "").toLowerCase()));
}

/**
 * F2-42: build invoice lines from the ledger rows of the billing period, so the
 * invoice total is the sum of its lines rather than a never-populated array.
 *
 * - `transaction_fee`: fee / commission ledger rows on bookings the provider
 *   collected directly (cash, card machine…). Fees on platform-held tenders are
 *   already retained at checkout and are never billed again.
 * - `other`: ledger rows explicitly tagged `metadata.provider_invoice_type = "other"`.
 * - Rows that already carry `metadata.provider_invoice_id` are skipped.
 */
export function buildProviderInvoiceLineItems(input: {
  invoiceType: string;
  ledgerRows: InvoiceLedgerRow[];
  paymentProvidersByBooking: Record<string, string[]>;
  bookingRefs: Record<string, string>;
  currency?: string;
}): { lineItems: ProviderInvoiceLineItem[]; subtotal: number } {
  const currency = input.currency ?? "ZAR";
  const lineItems: ProviderInvoiceLineItem[] = [];

  for (const row of input.ledgerRows) {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    if (meta.provider_invoice_id) continue;
    const amount = roundCurrency(Math.abs(Number(row.amount ?? 0)), currency);
    if (amount <= 0) continue;
    const type = String(row.transaction_type ?? "");

    if (input.invoiceType === "transaction_fee") {
      if (!(PROVIDER_FEE_LEDGER_TYPES as readonly string[]).includes(type)) continue;
      const bookingId = row.booking_id ?? null;
      if (!bookingId || !isProviderCollected(input.paymentProvidersByBooking[bookingId])) continue;
      const ref = input.bookingRefs[bookingId] ?? bookingId.slice(0, 8);
      lineItems.push({
        line_item_type: type,
        description: `${type === "commission" ? "Commission" : "Platform fee"} for booking ${ref}`,
        quantity: 1,
        unit_price: amount,
        total_price: amount,
        reference_type: "finance_transaction",
        reference_id: row.id,
        metadata: {
          booking_id: bookingId,
          booking_ref: ref,
          ledger_created_at: row.created_at ?? null,
          payment_providers: input.paymentProvidersByBooking[bookingId] ?? [],
        },
      });
      continue;
    }

    if (input.invoiceType === "other") {
      if (meta.provider_invoice_type !== OTHER_INVOICE_LEDGER_TAG) continue;
      lineItems.push({
        line_item_type: type || "other",
        description: row.description?.trim() || `Charge ${row.id.slice(0, 8)}`,
        quantity: 1,
        unit_price: amount,
        total_price: amount,
        reference_type: "finance_transaction",
        reference_id: row.id,
        metadata: {
          booking_id: row.booking_id ?? null,
          ledger_created_at: row.created_at ?? null,
        },
      });
    }
  }

  const subtotal = lineItems.length ? sumMoney(currency, ...lineItems.map((l) => l.total_price)) : 0;
  return { lineItems, subtotal };
}
