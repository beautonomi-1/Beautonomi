/**
 * Report query limits to prevent unbounded payloads and N+1 performance issues.
 * GAP-20: Report pagination/limits.
 */
export const MAX_REPORT_DAYS = 366;
export const MAX_BOOKINGS_FOR_REPORT = 10000;
export const MAX_FINANCE_TRANSACTIONS = 50000;

/**
 * Finance transaction types that match the main provider dashboard `revenue_*` cards
 * (`/api/provider/dashboard` — provider earnings from platform-settled bookings).
 */
export const DASHBOARD_REVENUE_TRANSACTION_TYPES = ["provider_earnings"] as const;

/**
 * Revenue base for staff service commission (percent of service earnings).
 * Excludes travel_fee (pass-through) and tip (tracked separately on pay runs).
 */
export const STAFF_COMMISSION_REVENUE_TYPES = ["provider_earnings"] as const;

/**
 * Full net booking-linked ledger total for per-booking allocation when tips/travel post as separate rows.
 * Differs from dashboard headline revenue and from staff commission base (see STAFF_COMMISSION_REVENUE_TYPES).
 */
export const LEDGER_FULL_PROVIDER_NET_TYPES = ["provider_earnings", "travel_fee", "tip"] as const;
