/**
 * Report query limits to prevent unbounded payloads and N+1 performance issues.
 * GAP-20: Report pagination/limits.
 */
export const MAX_REPORT_DAYS = 366;
export const MAX_BOOKINGS_FOR_REPORT = 10000;
export const MAX_FINANCE_TRANSACTIONS = 50000;
