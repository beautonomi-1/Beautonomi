/**
 * Report query limits to prevent unbounded payloads and N+1 performance issues.
 * GAP-20: Report pagination/limits.
 */
export const MAX_REPORT_DAYS = 366;
export const MAX_BOOKINGS_FOR_REPORT = 10000;
export const MAX_FINANCE_TRANSACTIONS = 50000;

/**
 * Accounting / reporting (provider-facing)
 *
 * - "Headline revenue" / dashboard cards: net `provider_earnings` in `finance_transactions`
 *   (platform-settled). See DASHBOARD_REVENUE_TRANSACTION_TYPES and getProviderRevenue
 *   when you pass the dashboard option. Walk-in clients paid in cash or on a provider
 *   terminal may not appear in the ledger; Paystack / platform flows do.
 * - Tips: separate `tip` rows; not included in DASHBOARD headline unless a report says so.
 * - Travel: often `travel_fee` rows; full booking net can use LEDGER_FULL_PROVIDER_NET_TYPES.
 * - Platform fees retained for the marketplace: `platform_fee` and `service_fee` (naming
 *   varies by product surface). Aligned with finance route, not ad-hoc `payment` type.
 * - Refunds: explicit `refund` plus negative `provider_earnings` (see finance route).
 *
 * Report-by-report date bases:
 * - Booking, staff, client, occupancy, cancellation, and no-show reports use `bookings.scheduled_at`
 *   unless their route comment says otherwise.
 * - Payment, refund, payout, Yoco, and end-of-day reports use payment/ledger capture timestamps
 *   and should label cash/terminal limitations when `location_id` cannot scope rows directly.
 * - Product inventory is provider-scoped stock, not location-scoped stock.
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
