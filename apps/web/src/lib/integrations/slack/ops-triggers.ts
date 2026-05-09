import { SLACK_EVENT_KEYS } from "@/lib/integrations/slack/event-keys";
import { tryNotifySlackEvent } from "@/lib/integrations/slack/dispatch";

function eventEnv(): "production" | "staging" | "development" {
  const e = process.env.BEAUTONOMI_SLACK_ENV || process.env.VERCEL_ENV || process.env.NODE_ENV;
  if (e === "development") return "development";
  if (e === "preview" || e === "staging") return "staging";
  return "production";
}

/** Booking dispute opened (admin or flows that insert into `booking_disputes`). */
export function slackNotifyDisputeOpened(params: {
  tenantId: string;
  disputeId: string;
  bookingId: string;
  reason: string;
}) {
  void tryNotifySlackEvent({
    tenantId: params.tenantId,
    environment: eventEnv(),
    eventKey: SLACK_EVENT_KEYS.DISPUTE_NEW,
    dedupeKey: `dispute:${params.disputeId}:opened`,
    entityType: "booking_dispute",
    entityId: params.disputeId,
    title: "Booking dispute opened",
    detailLines: [`Booking ${params.bookingId.slice(0, 8)}…`, `Reason: ${params.reason}`, "Action: review in Admin → Disputes"],
    actionUrl: `/bookings/${params.bookingId}`,
  });
}

/** User-submitted report (`user_reports`) pending triage. */
export function slackNotifyUserReportCreated(params: {
  tenantId: string;
  reportId: string;
  reportType: string;
}) {
  void tryNotifySlackEvent({
    tenantId: params.tenantId,
    environment: eventEnv(),
    eventKey: SLACK_EVENT_KEYS.SAFETY_USER_REPORT,
    dedupeKey: `user_report:${params.reportId}:created`,
    entityType: "user_report",
    entityId: params.reportId,
    title: "New user report",
    detailLines: [`Type: ${params.reportType}`, "Action: review in Admin → User reports"],
    actionUrl: "/user-reports",
  });
}

/** Manual upload or SumSub outcome that still needs admin review. */
export function slackNotifyVerificationNeedsReview(params: {
  tenantId: string;
  verificationId: string;
  documentType?: string | null;
  source?: "manual" | "sumsub_customer" | "sumsub_provider";
  detail?: string | null;
  /** Defaults to user verification detail path; use provider detail for SumSub provider reviews. */
  actionUrl?: string;
  entityType?: string;
}) {
  const src =
    params.source === "sumsub_customer"
      ? "SumSub (customer)"
      : params.source === "sumsub_provider"
        ? "SumSub (provider)"
        : "Manual document";
  const actionUrl = params.actionUrl ?? `/verifications/${params.verificationId}`;
  void tryNotifySlackEvent({
    tenantId: params.tenantId,
    environment: eventEnv(),
    eventKey: SLACK_EVENT_KEYS.VERIFICATION_PENDING,
    dedupeKey: `verification:${params.verificationId}:${params.source ?? "manual"}:review`,
    entityType: params.entityType ?? "user_verification",
    entityId: params.verificationId,
    title: "Identity verification needs review",
    detailLines: [
      src,
      params.documentType ? `Document: ${params.documentType}` : null,
      params.detail,
      params.source === "sumsub_provider"
        ? "Action: Admin → Providers"
        : "Action: Admin → Verifications",
    ].filter(Boolean) as string[],
    actionUrl,
  });
}
