/**
 * Checkout / pending-request copy aligned with server/cron business-hours SLA.
 * Prefer `pending_confirmation_sla` from the API; this is the offline fallback.
 */
export { pendingConfirmationSlaDisplay } from "@beautonomi/utils";
