/**
 * Maps provider report API route segments to subscription report_types keys.
 * Used by requireProviderReportsAccess for subscription gating.
 */

export const REPORT_ROUTE_SUBSCRIPTION_TYPE = {
  "sales/summary": "sales",
  "sales/services": "sales",
  "sales/trends": "sales",
  revenue: "sales",
  "weekly-revenue": "sales",
  services: "sales",
  "business/overview": "sales",
  "business/dashboard": "sales",
  "business/comparison": "sales",
  bookings: "bookings",
  "bookings/summary": "bookings",
  "bookings/status": "bookings",
  "bookings/cancellations": "bookings",
  "bookings/no-shows": "bookings",
  occupancy: "bookings",
  "end-of-day": "bookings",
  clients: "clients",
  "clients/summary": "clients",
  "clients/new": "clients",
  "clients/retention": "clients",
  "clients/lifetime-value": "clients",
  staff: "staff",
  "staff/performance": "staff",
  "staff/hours": "staff",
  "staff/commission": "staff",
  products: "products",
  "products/sales": "products",
  "products/top": "products",
  /** Service revenue ranking (feeds the mobile dashboard); not a product report. */
  "top-services": "sales",
  payments: "payments",
  "payments/summary": "payments",
  "payments/methods": "payments",
  "payments/refunds": "payments",
  "payments/payouts": "payments",
  "payments/yoco-reconciliation": "payments",
  "payments/paystack-terminal-reconciliation": "payments",
  "gift-cards": "gift_cards",
  "gift-cards/sales": "gift_cards",
  "gift-cards/redemptions": "gift_cards",
  packages: "packages",
  "packages/sales": "packages",
  "packages/usage": "packages",
  memberships: "memberships",
} as const;

export type ReportSubscriptionType =
  (typeof REPORT_ROUTE_SUBSCRIPTION_TYPE)[keyof typeof REPORT_ROUTE_SUBSCRIPTION_TYPE];

/** Permission-only; never subscription-gated (operational, not analytics). */
export const UNGATED_REPORT_ROUTES = ["products/inventory"] as const;

/** Gated on advanced_analytics.enabled only (no report type). */
export const ANALYTICS_ENABLED_ONLY_ROUTES = ["schedule"] as const;

export type ReportAccessGate =
  | { reportType: ReportSubscriptionType }
  | { reportType: "analytics_only" };
