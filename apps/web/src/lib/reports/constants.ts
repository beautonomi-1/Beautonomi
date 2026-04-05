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
 * Full net booking-linked ledger total for commission / allocation (service earnings + travel + tips).
 * Differs from dashboard headline revenue when travel/tips post as separate rows.
 */
export const LEDGER_FULL_PROVIDER_NET_TYPES = ["provider_earnings", "travel_fee", "tip"] as const;
