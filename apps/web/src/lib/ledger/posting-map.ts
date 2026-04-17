/**
 * F14 — Posting map from domain events to journal entries.
 *
 * These mappings are the canonical spec for "what should the shadow-writer
 * and any future application-level writer emit into journal_entries /
 * journal_lines". The SQL shadow trigger (migration 495) implements a
 * simplified subset; this file lets us cross-check, expand posting, and
 * eventually move ledger writes out of the trigger into application code.
 */

export type GlAccountCode =
  | "1000"
  | "1100"
  | "2000"
  | "2100"
  | "2200"
  | "3000"
  | "4000"
  | "4100";

export interface JournalLineSpec {
  account: GlAccountCode;
  side: "debit" | "credit";
  amount: number;
  memo?: string;
}

export interface JournalEntrySpec {
  source: string;
  externalRef: string;
  description: string;
  lines: JournalLineSpec[];
}

export interface BookingPaymentInput {
  paymentId: string;
  gross: number;
  platformFee: number;
  gatewayFee: number;
  taxAmount: number;
  tipAmount: number;
}

/**
 * Balanced posting for a successful booking payment.
 *
 *   DR 1000 Cash clearing    gross
 *   DR 4000 Gateway fees     gatewayFee
 *   CR 1000 Cash clearing    gatewayFee
 *   CR 3000 Platform revenue platformFee
 *   CR 2100 Tax payable      taxAmount
 *   CR 2200 Tips payable     tipAmount
 *   CR 2000 Provider payable gross - platformFee - taxAmount - tipAmount
 */
export function postBookingPayment(input: BookingPaymentInput): JournalEntrySpec {
  const providerNet =
    input.gross - input.platformFee - input.taxAmount - input.tipAmount;
  const lines: JournalLineSpec[] = [
    { account: "1000", side: "debit",  amount: input.gross },
    { account: "4000", side: "debit",  amount: input.gatewayFee },
    { account: "1000", side: "credit", amount: input.gatewayFee },
    { account: "3000", side: "credit", amount: input.platformFee },
  ];
  if (input.taxAmount > 0) lines.push({ account: "2100", side: "credit", amount: input.taxAmount });
  if (input.tipAmount > 0) lines.push({ account: "2200", side: "credit", amount: input.tipAmount });
  lines.push({ account: "2000", side: "credit", amount: providerNet });
  return {
    source: "booking_payments",
    externalRef: input.paymentId,
    description: "booking payment",
    lines,
  };
}

export interface BookingRefundInput {
  refundId: string;
  amount: number;
}

export function postBookingRefund(input: BookingRefundInput): JournalEntrySpec {
  return {
    source: "booking_refunds",
    externalRef: input.refundId,
    description: "booking refund",
    lines: [
      { account: "4100", side: "debit",  amount: Math.abs(input.amount) },
      { account: "1000", side: "credit", amount: Math.abs(input.amount) },
    ],
  };
}

/** Verify a posting is internally balanced. */
export function isBalanced(entry: JournalEntrySpec): boolean {
  const debits = entry.lines
    .filter((l) => l.side === "debit")
    .reduce((s, l) => s + l.amount, 0);
  const credits = entry.lines
    .filter((l) => l.side === "credit")
    .reduce((s, l) => s + l.amount, 0);
  return Math.round((debits - credits) * 100) === 0;
}
