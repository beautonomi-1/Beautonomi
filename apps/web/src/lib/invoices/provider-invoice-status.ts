/**
 * Effective invoice status and filters — due date drives overdue before cron runs.
 */

export type StoredInvoiceStatus =
  | "draft"
  | "sent"
  | "paid"
  | "partially_paid"
  | "overdue"
  | "cancelled"
  | "refunded";

export type InvoiceStatusRow = {
  status?: string | null;
  due_date?: string | null;
  total_amount?: number | null;
  amount_paid?: number | null;
  amount_due?: number | null;
};

export function invoiceAmountDue(row: InvoiceStatusRow): number {
  const stored = Number(row.amount_due ?? NaN);
  if (Number.isFinite(stored)) return Math.max(0, stored);
  return Math.max(
    0,
    Number(row.total_amount ?? 0) - Number(row.amount_paid ?? 0),
  );
}

export function isInvoicePastDue(dueDate: string | null | undefined, todayYmd?: string): boolean {
  if (!dueDate) return false;
  const today =
    todayYmd ??
    new Date().toISOString().slice(0, 10);
  return dueDate.slice(0, 10) < today;
}

export function effectiveInvoiceStatus(
  row: InvoiceStatusRow,
  todayYmd?: string,
): StoredInvoiceStatus | string {
  const status = String(row.status ?? "");
  if (status === "draft" || status === "cancelled" || status === "refunded" || status === "paid") {
    return status;
  }
  const due = invoiceAmountDue(row);
  if (due <= 0 && status !== "draft") return "paid";
  if (
    isInvoicePastDue(row.due_date, todayYmd) &&
    (status === "sent" || status === "partially_paid" || status === "overdue")
  ) {
    return "overdue";
  }
  return status;
}

/** Statuses that still owe money (issued, not draft). */
export function isOpenInvoiceStatus(effective: string): boolean {
  return effective === "sent" || effective === "partially_paid" || effective === "overdue";
}

export const SETTLEMENT_STATUSES = new Set(["paid", "partially_paid", "refunded"]);
