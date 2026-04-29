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
  "sales-summary": { title: "Sales Summary", subtitle: "Revenue, bookings, and service mix", apiPath: "sales/summary", query: "fromTo" },
  "product-sales": { title: "Product Sales", subtitle: "Retail product revenue", apiPath: "products/sales", query: "fromTo" },
  "revenue-trends": { title: "Revenue Trends", subtitle: "Trends over time", apiPath: "sales/trends", query: "periodDMWY" },
  "staff-commission": { title: "Commission Reports", subtitle: "Commission breakdown by staff", apiPath: "staff/commission", query: "fromTo" },
  "staff-hours": { title: "Hours & Attendance", subtitle: "Worked hours and attendance", apiPath: "staff/hours", query: "fromTo" },
  "booking-status": { title: "Booking Status", subtitle: "Confirmed, completed, pending", apiPath: "bookings/status", query: "fromTo" },
  occupancy: { title: "Occupancy", subtitle: "Capacity and utilization", apiPath: "occupancy", query: "fromTo" },
  cancellations: { title: "Cancellations", subtitle: "Cancelled bookings", apiPath: "bookings/cancellations", query: "fromTo" },
  "no-shows": { title: "No-Shows", subtitle: "Missed appointments", apiPath: "bookings/no-shows", query: "fromTo" },
  "client-retention": { title: "Client Retention", subtitle: "Repeat completed-visit rates", apiPath: "clients/retention", query: "periodMQY" },
  "new-clients": { title: "New Clients", subtitle: "First confirmed/completed bookings", apiPath: "clients/new", query: "fromTo" },
  "client-lifetime-value": { title: "Lifetime Value", subtitle: "Completed booking value by client", apiPath: "clients/lifetime-value", query: "none" },
  "end-of-day": { title: "End of day", subtitle: "Daily cash-up style summary", apiPath: "end-of-day", query: "singleDate" },
  refunds: { title: "Refunds", subtitle: "Ledger refund volume and provider reversal impact", apiPath: "payments/refunds", query: "fromTo" },
  "payment-methods": { title: "Payment Methods", subtitle: "Card, cash, wallet split", apiPath: "payments/methods", query: "fromTo" },
  payouts: { title: "Payout Earnings", subtitle: "Platform-held provider earnings, not bank payout history", apiPath: "payments/payouts", query: "fromTo" },
  "yoco-reconciliation": { title: "Yoco reconciliation", subtitle: "Terminal sync debugging", apiPath: "payments/yoco-reconciliation", query: "fromTo" },
  inventory: { title: "Inventory", subtitle: "Stock levels by SKU", apiPath: "products/inventory", query: "none" },
  "top-products": {
    title: "Top Products",
    subtitle: "Best sellers",
    apiPath: "products/top",
    query: "fromTo",
    extraSearch: () => "&limit=50",
  },
  "package-sales": { title: "Package Bookings", subtitle: "Booked package line value, excluding fees and tips", apiPath: "packages/sales", query: "fromTo" },
  "package-usage": { title: "Package Usage", subtitle: "Redemptions and balances", apiPath: "packages/usage", query: "fromTo" },
  "performance-dashboard": { title: "Performance Dashboard", subtitle: "KPIs at a glance", apiPath: "business/dashboard", query: "none" },
  comparison: { title: "Period Comparison", subtitle: "Compare two periods", apiPath: "business/comparison", query: "periodMQY" },
};
