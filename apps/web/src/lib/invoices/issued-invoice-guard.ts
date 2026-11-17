/**
 * F2-44: an invoice that has been issued (anything past `draft`) is a tax
 * document. Its financial content must not change — only its status may move
 * (e.g. sent → cancelled / refunded) and free-text notes may be added. Any other
 * correction is a credit note + new invoice.
 */

export const INVOICE_FINANCIAL_FIELDS = new Set([
  "invoice_type",
  "period_start",
  "period_end",
  "issue_date",
  "due_date",
  "tax_rate",
  "description",
  "line_items",
]);

export function isIssuedInvoiceStatus(status: string | null | undefined): boolean {
  const s = String(status ?? "");
  return s !== "" && s !== "draft";
}

/**
 * Returns the names of financial fields present (non-undefined) in `patch` that
 * must be rejected because the invoice is already issued. Empty array = allowed.
 */
export function rejectedFinancialFieldsForIssuedInvoice(
  currentStatus: string | null | undefined,
  patch: Record<string, unknown>,
): string[] {
  if (!isIssuedInvoiceStatus(currentStatus)) return [];
  return Object.keys(patch).filter((k) => patch[k] !== undefined && INVOICE_FINANCIAL_FIELDS.has(k));
}
