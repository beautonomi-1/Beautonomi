/**
 * Payment Status Canonical Mapping
 *
 * Cross-Portal Synergy: bookings and sales use different vocabularies for the same concept.
 * - bookings.payment_status: pending | paid | partially_paid | refunded | failed
 * - sales.payment_status: pending | completed | failed | refunded
 *
 * "paid" (bookings) and "completed" (sales) both mean "transaction successfully completed".
 * Use this module when displaying or comparing across domains.
 */

export const BOOKING_PAID_STATUSES = ['paid', 'partially_paid'] as const;
export const SALES_PAID_STATUS = 'completed';

/**
 * Normalize payment status for display in receipts/UI.
 * Maps sales 'completed' to 'paid' for consistent customer-facing language.
 */
export function normalizePaymentStatusForDisplay(
  status: string | null | undefined,
  domain: 'bookings' | 'sales' = 'bookings'
): string {
  if (!status) return 'pending';
  if (domain === 'sales' && status === 'completed') return 'paid';
  return status;
}

/**
 * Check if status indicates successful payment (for filtering queries).
 * Use when querying: bookings use 'paid', sales use 'completed'.
 */
export function isPaidStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return status === 'paid' || status === 'completed' || status === 'partially_paid';
}
