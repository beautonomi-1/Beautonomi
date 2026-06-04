/**
 * GET /api/provider/reports/payments  (DEPRECATED ALIAS)
 *
 * This endpoint historically computed its own provider "net revenue" formula, which
 * diverged from the dashboard, business overview and payment-summary numbers and was a
 * source of the "totals look wrong" reports. It has no remaining in-app consumers
 * (the reports UI and detail registry use `/api/provider/reports/payments/summary`).
 *
 * It now delegates entirely to the payment summary route so there is a single source of
 * truth for payment / accounting aggregates. Prefer calling `payments/summary` directly.
 */
export { GET } from "./summary/route";
