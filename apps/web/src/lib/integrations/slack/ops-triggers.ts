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

export function slackNotifyPaystackTerminalAssetRequested(params: {
  tenantId?: string | null;
  terminalId: string;
  terminalCode?: string | null;
  providerName?: string | null;
  terminalName?: string | null;
  paymentLink?: string | null;
  requestedBy?: string | null;
  autoRequested?: boolean;
}) {
  void tryNotifySlackEvent({
    tenantId: params.tenantId ?? "platform",
    environment: eventEnv(),
    eventKey: SLACK_EVENT_KEYS.FINANCE_PAYSTACK_TERMINAL_ASSET_REQUESTED,
    dedupeKey: `paystack_terminal:${params.terminalId}:asset_requested`,
    entityType: "provider_paystack_virtual_terminal",
    entityId: params.terminalId,
    title: params.autoRequested
      ? "Paystack Terminal created — QR/poster setup needed"
      : "Paystack Terminal branded QR/poster requested",
    detailLines: [
      params.providerName ? `Provider: ${params.providerName}` : null,
      params.terminalName ? `Terminal: ${params.terminalName}` : null,
      params.terminalCode ? `Code: ${params.terminalCode}` : null,
      params.paymentLink ? `Payment link: ${params.paymentLink}` : "Payment link: missing",
      params.requestedBy ? `Requested by: ${params.requestedBy}` : null,
      "Action: Admin → Paystack Terminal → Terminal setup queue",
    ].filter(Boolean) as string[],
    actionUrl: "/paystack-terminal",
  }).catch((err) => {
    console.error("[slack] paystack_terminal asset_requested notify error", err);
  });
}

export function slackNotifyPaystackTerminalSetupRequested(params: {
  tenantId?: string | null;
  requestId?: string | null;
  providerId: string;
  providerName?: string | null;
  requestedBy?: string | null;
  suggestedTerminalName?: string | null;
  destinationTarget?: string | null;
}) {
  void tryNotifySlackEvent({
    tenantId: params.tenantId ?? "platform",
    environment: eventEnv(),
    eventKey: SLACK_EVENT_KEYS.FINANCE_PAYSTACK_TERMINAL_SETUP_REQUESTED,
    dedupeKey: params.requestId
      ? `paystack_terminal_setup:${params.requestId}:requested`
      : `provider:${params.providerId}:paystack_terminal_setup_requested`,
    entityType: "provider_paystack_virtual_terminal_setup_request",
    entityId: params.requestId ?? params.providerId,
    title: "Paystack Terminal setup requested",
    detailLines: [
      params.providerName ? `Provider: ${params.providerName}` : `Provider ID: ${params.providerId}`,
      params.suggestedTerminalName ? `Suggested Paystack name: ${params.suggestedTerminalName}` : null,
      params.destinationTarget ? `WhatsApp destination: ${params.destinationTarget}` : "WhatsApp destination: missing",
      params.requestedBy ? `Requested by: ${params.requestedBy}` : null,
      "Action: create or fetch the Virtual Terminal in Paystack, then import its code, payment link, QR/poster into Admin → Paystack Terminal.",
    ].filter(Boolean) as string[],
    actionUrl: "/paystack-terminal",
  }).catch((err) => {
    console.error("[slack] paystack_terminal setup_requested notify error", err);
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

/** Self-service permanent account deletion completed (POST /api/me/delete-account). */
export function slackNotifySelfServiceAccountDeletionSucceeded(params: {
  tenantId: string;
  userId: string;
  role: string;
  email?: string | null;
  providerId?: string | null;
  reason?: string | null;
}) {
  const roleLabel = params.role.replace(/_/g, " ");
  void tryNotifySlackEvent({
    tenantId: params.tenantId,
    environment: eventEnv(),
    eventKey: SLACK_EVENT_KEYS.COMPLIANCE_ACCOUNT_DELETION_SUCCEEDED,
    dedupeKey: `account_deletion:${params.userId}:succeeded`,
    entityType: "user",
    entityId: params.userId,
    title: "Self-service account permanently deleted",
    detailLines: [
      `User: ${params.email ?? params.userId.slice(0, 8) + "…"}`,
      `Role: ${roleLabel}`,
      params.providerId ? `Provider org: ${params.providerId}` : null,
      params.reason ? `Reason: ${params.reason}` : "Reason: (not provided)",
      "Action: user initiated delete via app/web; data purged via compliance_clear_user_references.",
      "Admin → Control plane → Compliance purge audit (if logged).",
    ].filter(Boolean) as string[],
    actionUrl: "/control-plane/compliance",
  }).catch((err) => {
    console.error("[slack] account_deletion succeeded notify error", err);
  });
}

/** Self-service account deletion failed after verification (purge or auth delete). */
export function slackNotifySelfServiceAccountDeletionFailed(params: {
  tenantId: string;
  userId: string;
  role: string;
  email?: string | null;
  providerId?: string | null;
  failureCode?: string | null;
  failureMessage?: string | null;
  preUpdateFailed?: boolean;
}) {
  const roleLabel = params.role.replace(/_/g, " ");
  void tryNotifySlackEvent({
    tenantId: params.tenantId,
    environment: eventEnv(),
    eventKey: SLACK_EVENT_KEYS.COMPLIANCE_ACCOUNT_DELETION_FAILED,
    dedupeKey: `account_deletion:${params.userId}:failed:${params.failureCode ?? "unknown"}`,
    entityType: "user",
    entityId: params.userId,
    title: "Self-service account deletion failed",
    detailLines: [
      `User: ${params.email ?? params.userId.slice(0, 8) + "…"}`,
      `Role: ${roleLabel}`,
      params.providerId ? `Provider org: ${params.providerId}` : null,
      params.failureCode ? `Code: ${params.failureCode}` : null,
      params.failureMessage ? `Detail: ${params.failureMessage}` : null,
      params.preUpdateFailed ? "Note: audit pre-update stamp failed; purge was still attempted." : null,
      "Action: check server logs and assist user or run Admin compliance purge if erasure is required.",
      "Admin → Users (search by email) or Compliance purge.",
    ].filter(Boolean) as string[],
    actionUrl: params.email ? `/users?search=${encodeURIComponent(params.email)}` : "/users",
  }).catch((err) => {
    console.error("[slack] account_deletion failed notify error", err);
  });
}
