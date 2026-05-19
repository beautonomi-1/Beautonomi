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

/**
 * SumSub or internal system rejected a verification — admin should follow up
 * with the user/provider to explain next steps or request a resubmission.
 */
export function slackNotifyVerificationRejected(params: {
  tenantId: string;
  verificationId: string;
  source: "sumsub_customer" | "sumsub_provider" | "manual";
  subject?: string | null;
  detail?: string | null;
  actionUrl?: string;
  entityType?: string;
}) {
  const src =
    params.source === "sumsub_customer"
      ? "SumSub (customer)"
      : params.source === "sumsub_provider"
        ? "SumSub (provider)"
        : "Manual review";
  void tryNotifySlackEvent({
    tenantId: params.tenantId,
    environment: eventEnv(),
    eventKey: SLACK_EVENT_KEYS.VERIFICATION_REJECTED,
    dedupeKey: `verification:${params.verificationId}:${params.source}:rejected`,
    entityType: params.entityType ?? "user_verification",
    entityId: params.verificationId,
    title: "Verification rejected — follow-up required",
    detailLines: [
      src,
      params.subject ? `User/provider: ${params.subject}` : null,
      params.detail ?? null,
      "Action: notify user/provider and guide resubmission",
      params.source === "sumsub_provider"
        ? "Admin → Provider Lifecycle → Verification card"
        : "Admin → Verifications",
    ].filter(Boolean) as string[],
    actionUrl: params.actionUrl ?? `/verifications/${params.verificationId}`,
  });
}

/**
 * An admin has manually reviewed (approved or rejected) an identity verification.
 * Fired for audit/accountability purposes so the team can see review activity in Slack.
 */
export function slackNotifyVerificationReviewed(params: {
  tenantId: string;
  verificationId: string;
  outcome: "approved" | "rejected";
  reviewerName?: string | null;
  subjectName?: string | null;
  rejectionReason?: string | null;
}) {
  const emoji = params.outcome === "approved" ? "✅" : "❌";
  void tryNotifySlackEvent({
    tenantId: params.tenantId,
    environment: eventEnv(),
    eventKey: SLACK_EVENT_KEYS.VERIFICATION_REVIEWED,
    dedupeKey: `verification:${params.verificationId}:reviewed:${params.outcome}`,
    entityType: "user_verification",
    entityId: params.verificationId,
    title: `${emoji} Verification ${params.outcome} by admin`,
    detailLines: [
      params.subjectName ? `User: ${params.subjectName}` : null,
      params.reviewerName ? `Reviewed by: ${params.reviewerName}` : null,
      params.outcome === "rejected" && params.rejectionReason
        ? `Reason: ${params.rejectionReason}`
        : null,
    ].filter(Boolean) as string[],
    actionUrl: `/verifications/${params.verificationId}`,
  });
}

/**
 * A custom-offer payment was captured but the follow-up booking creation
 * failed. The customer has been charged — finance/support needs to either
 * retry the finalize or issue a refund manually.
 *
 * §custom-requests-lifecycle-2026-05
 */
export function slackNotifyCustomOfferFinalizeFailed(params: {
  tenantId?: string | null;
  offerId: string;
  reference?: string | null;
  reason?: string | null;
  bookingId?: string | null;
}) {
  void tryNotifySlackEvent({
    tenantId: params.tenantId ?? "platform",
    environment: eventEnv(),
    eventKey: SLACK_EVENT_KEYS.CUSTOM_OFFER_FINALIZE_FAILED,
    dedupeKey: `custom_offer:${params.offerId}:finalize_failed`,
    entityType: "custom_offer",
    entityId: params.offerId,
    title: "Custom offer paid but booking creation failed",
    detailLines: [
      `Offer: ${params.offerId.slice(0, 8)}…`,
      params.reference ? `Payment ref: ${params.reference}` : null,
      params.reason ? `Reason: ${params.reason}` : null,
      params.bookingId ? `Booking row: ${params.bookingId}` : null,
      "Action: review in Admin → Custom offers and retry or refund.",
    ].filter(Boolean) as string[],
    actionUrl: `/custom-offers/${params.offerId}`,
  }).catch((err) => {
    console.error("[slack] custom_offer finalize_failed notify error", err);
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
