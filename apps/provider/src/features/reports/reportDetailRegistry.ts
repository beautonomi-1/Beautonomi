/**
 * Native report screens: maps catalog reportId to GET /api/provider/reports/... query strategy.
 * Query modes must match the server routes under apps/web/src/app/api/provider/reports/.
 */

export type ReportQueryMode =
  | "fromTo"
  | "periodMQY"
  | "periodDMWY"
  | "singleDate"
  | "none";

export type ReportDetailDefinition = {
  title: string;
  subtitle?: string;
  /** Suffix after /api/provider/reports/ */
  apiPath: string;
  query: ReportQueryMode;
  /** Optional extra query params (e.g. limit for top-products) */
  extraSearch?: (opts: { from: string; to: string; period: string; date: string }) => string;
};

export const REPORT_DETAIL_REGISTRY: Record<string, ReportDetailDefinition> = {
  "sales-summary": {
    title: "Sales Summary",
    subtitle: "Ledger net vs recorded takings logged in-app",
    apiPath: "sales/summary",
    query: "fromTo",
  },
  "product-sales": {
    title: "Product Sales",
    subtitle: "Add-ons by appointment date + paid orders by order date — see facts",
    apiPath: "products/sales",
    query: "fromTo",
  },
  "revenue-trends": {
    title: "Revenue trends",
    subtitle: "Ledger net vs visits by bucket",
    apiPath: "sales/trends",
    query: "periodDMWY",
  },
  "staff-commission": { title: "Commission Reports", subtitle: "Commission breakdown by staff", apiPath: "staff/commission", query: "fromTo" },
  "staff-hours": { title: "Hours & Attendance", subtitle: "Worked hours and attendance", apiPath: "staff/hours", query: "fromTo" },
  "booking-status": {
    title: "Booking Status",
    subtitle: "Scheduled mix vs ledger net by current status",
    apiPath: "bookings/status",
    query: "fromTo",
  },
  occupancy: {
    title: "Occupancy",
    subtitle: "Booked service minutes vs scheduled availability",
    apiPath: "occupancy",
    query: "fromTo",
  },
  cancellations: {
    title: "Cancellations",
    subtitle: "Rate, reasons, and ledger net in range",
    apiPath: "bookings/cancellations",
    query: "fromTo",
  },
  "no-shows": { title: "No-Shows", subtitle: "Missed appointments", apiPath: "bookings/no-shows", query: "fromTo" },
  "client-retention": {
    title: "Client Retention",
    subtitle: "Completed visits — repeat share & period overlap",
    apiPath: "clients/retention",
    query: "periodMQY",
  },
  "client-summary": {
    title: "Client Summary",
    subtitle: "Distinct clients, new vs repeat in range",
    apiPath: "clients/summary",
    query: "fromTo",
  },
  "new-clients": { title: "New Clients", subtitle: "First confirmed/completed bookings", apiPath: "clients/new", query: "fromTo" },
  "client-lifetime-value": { title: "Lifetime Value", subtitle: "Completed booking value by client", apiPath: "clients/lifetime-value", query: "none" },
  "end-of-day": {
    title: "End of day",
    subtitle: "Recorded takings by payment capture date",
    apiPath: "end-of-day",
    query: "singleDate",
  },
  refunds: {
    title: "Refunds",
    subtitle: "Ledger refunds vs provider earnings reversals",
    apiPath: "payments/refunds",
    query: "fromTo",
  },
  "payment-summary": {
    title: "Payment Summary",
    subtitle: "Booked value vs ledger-settled customer funds",
    apiPath: "payments/summary",
    query: "fromTo",
  },
  "payment-methods": {
    title: "Payment Methods",
    subtitle: "Settlement-window mix — gateways, till logs, wallet splits",
    apiPath: "payments/methods",
    query: "fromTo",
  },
  payouts: {
    title: "Payout earnings (ledger)",
    subtitle: "Ledger settlement window — provider earnings, not bank transfers",
    apiPath: "payments/payouts",
    query: "fromTo",
  },
  "yoco-reconciliation": {
    title: "Yoco reconciliation",
    subtitle: "Terminal captures vs booking_payments",
    apiPath: "payments/yoco-reconciliation",
    query: "fromTo",
    extraSearch: () => "&limit=300",
  },
  "paystack-terminal-reconciliation": {
    title: "Paystack Terminal reconciliation",
    subtitle: "Terminal captures, allocations, and payout readiness",
    apiPath: "payments/paystack-terminal-reconciliation",
    query: "none",
  },
  inventory: {
    title: "Product & inventory",
    subtitle: "Catalogue snapshot — variants, tracking, alerts (provider-wide)",
    apiPath: "products/inventory",
    query: "none",
  },
  "top-products": {
    title: "Top Products",
    subtitle: "By line revenue — mixed appointment/order dates · limit 50",
    apiPath: "products/top",
    query: "fromTo",
    extraSearch: () => "&limit=50",
  },
  "package-sales": {
    title: "Package sales",
    subtitle: "Booked package line value (scheduled window) — see facts",
    apiPath: "packages/sales",
    query: "fromTo",
  },
  "package-usage": {
    title: "Package usage",
    subtitle: "Usage events & distinct clients (incl. group participants) — see facts",
    apiPath: "packages/usage",
    query: "fromTo",
  },
  "membership-sales": {
    title: "Membership sales",
    subtitle: "Gross liability sales, recognized earnings, active subscribers",
    apiPath: "memberships",
    query: "fromTo",
  },
  "performance-dashboard": {
    title: "Performance Dashboard",
    subtitle: "Ledger earnings + booking snapshots — see facts",
    apiPath: "business/dashboard",
    query: "none",
  },
  comparison: {
    title: "Period comparison",
    subtitle: "Period-to-date vs prior full period — see facts",
    apiPath: "business/comparison",
    query: "periodMQY",
  },
};
