/**
 * Human-readable labels for raw enum/status strings that otherwise leak to the
 * provider UI (booking statuses, payout/payment statuses, ledger transaction
 * types, reconciliation states). Unknown values fall back to Title Case of the
 * de-snaked string so we never render a raw `no_show` / `provider_earnings`
 * token to a user.
 */
const STATUS_LABELS: Record<string, string> = {
  // Booking lifecycle
  pending: "Pending",
  pending_approval: "Pending approval",
  booked: "Booked",
  confirmed: "Confirmed",
  in_progress: "In progress",
  started: "Started",
  completed: "Completed",
  cancelled: "Cancelled",
  canceled: "Cancelled",
  no_show: "No-show",
  rescheduled: "Rescheduled",
  declined: "Declined",
  expired: "Expired",
  // Payment / payout / invoice statuses
  processing: "Processing",
  paid: "Paid",
  unpaid: "Unpaid",
  partially_paid: "Partially paid",
  succeeded: "Succeeded",
  success: "Successful",
  failed: "Failed",
  refunded: "Refunded",
  partially_refunded: "Partially refunded",
  voided: "Voided",
  draft: "Draft",
  sent: "Sent",
  overdue: "Overdue",
  active: "Active",
  inactive: "Inactive",
  redeemed: "Redeemed",
  // Reconciliation states (Paystack terminal)
  allocated: "Allocated",
  unallocated: "Unallocated",
  held: "Held",
  eligible: "Eligible",
  received: "Received",
  matched: "Matched",
  mismatched: "Mismatched",
  // Ledger transaction types
  provider_earnings: "Earnings",
  platform_fee: "Platform fee",
  service_fee: "Service fee",
  payout: "Payout",
  refund: "Refund",
  tip: "Tip",
  travel_fee: "Travel fee",
  cancellation_fee: "Cancellation fee",
  tax: "Tax",
  provider_subscription_payment: "Subscription payment",
  provider_ads_payment: "Ads payment",
};

export function formatStatusLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const key = value.trim().toLowerCase();
  if (!key) return "—";
  if (STATUS_LABELS[key]) return STATUS_LABELS[key];
  return key
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
