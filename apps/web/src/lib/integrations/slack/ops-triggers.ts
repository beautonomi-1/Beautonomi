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

/**
 * Panic button pressed (`safety_events` panic row). Highest-signal safety alert —
 * routes to `safety.panic.created`, falling back to the user-report / dispute channels.
 */
export function slackNotifySafetyPanic(params: {
  tenantId: string;
  eventId: string;
  userId: string;
  bookingId?: string | null;
  source?: string | null;
  auraDispatched?: boolean;
  emergencyContact?: {
    name?: string | null;
    phone?: string | null;
    relationship?: string | null;
  } | null;
}) {
  void tryNotifySlackEvent({
    tenantId: params.tenantId,
    environment: eventEnv(),
    eventKey: SLACK_EVENT_KEYS.SAFETY_PANIC,
    dedupeKey: `safety_event:${params.eventId}:panic`,
    entityType: "safety_event",
    entityId: params.eventId,
    title: "🚨 Panic button pressed",
    detailLines: [
      `User ${params.userId.slice(0, 8)}…`,
      params.bookingId ? `Booking ${params.bookingId.slice(0, 8)}…` : "No booking attached",
      params.source ? `Source: ${params.source}` : "",
      params.emergencyContact?.name
        ? `Emergency contact: ${params.emergencyContact.name}${params.emergencyContact.phone ? ` (${params.emergencyContact.phone})` : ""}`
        : "Emergency contact: not on file",
      params.auraDispatched ? "Aura: dispatched" : "Aura: not dispatched — manual follow-up required",
      "Action: triage in Admin → Trust & Safety → Safety logs",
    ],
    actionUrl: "/control-plane/safety-logs",
  });
}

/** Fraud case opened from a deterministic signal (webhook, ticket, etc.). */
export function slackNotifyFraudCaseOpened(params: {
  tenantId: string;
  fraudCaseId: string;
  signal: string;
  riskScore: number;
  paymentReference?: string | null;
}) {
  void tryNotifySlackEvent({
    tenantId: params.tenantId,
    environment: eventEnv(),
    eventKey: SLACK_EVENT_KEYS.FRAUD_CASE_OPENED,
    dedupeKey: `fraud-case:${params.fraudCaseId}:opened`,
    entityType: "fraud_case",
    entityId: params.fraudCaseId,
    title: "Fraud case opened",
    detailLines: [
      `Signal: ${params.signal}`,
      `Risk score: ${params.riskScore}`,
      params.paymentReference ? `Payment ref: ${params.paymentReference}` : null,
      "Action: review in Admin → Fraud Cases",
    ].filter(Boolean) as string[],
    actionUrl: "/fraud-cases",
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

/** UGC content report submitted (`content_reports`). */
export function slackNotifyContentReportCreated(params: {
  tenantId: string;
  reportId: string;
  targetType: string;
  reason: string;
}) {
  void tryNotifySlackEvent({
    tenantId: params.tenantId,
    environment: eventEnv(),
    eventKey: SLACK_EVENT_KEYS.SAFETY_CONTENT_REPORT,
    dedupeKey: `content_report:${params.reportId}:created`,
    entityType: "content_report",
    entityId: params.reportId,
    title: "New content report",
    detailLines: [
      `Target: ${params.targetType}`,
      `Reason: ${params.reason}`,
      "Action: review in Admin → Content reports",
    ],
    actionUrl: "/content-reports",
  });
}

export function slackNotifyContentReportTakedown(params: {
  tenantId: string;
  reportId: string;
  targetType: string;
  targetId: string;
  action: string;
}) {
  void tryNotifySlackEvent({
    tenantId: params.tenantId,
    environment: eventEnv(),
    eventKey: SLACK_EVENT_KEYS.SAFETY_CONTENT_TAKEDOWN,
    dedupeKey: `content_report:${params.reportId}:takedown`,
    entityType: "content_report",
    entityId: params.reportId,
    title: "Content report takedown applied",
    detailLines: [
      `Target: ${params.targetType} ${params.targetId.slice(0, 8)}…`,
      `Action: ${params.action}`,
    ],
    actionUrl: "/content-reports",
  });
}

/**
 * SumSub or internal system rejected a verification — admin should follow up
 * with the user/provider to explain next steps or request a resubmission.
 */
export function slackNotifyVerificationRejected(params: {
  tenantId: string;
  verificationId: string;
  source: "sumsub_customer" | "sumsub_provider" | "manual" | "didit_customer" | "didit_provider" | "didit_kyb";
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
        : params.source === "didit_customer"
          ? "Didit (customer)"
          : params.source === "didit_provider"
            ? "Didit (provider)"
            : params.source === "didit_kyb"
              ? "Didit (KYB)"
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
        : params.source === "didit_provider" || params.source === "didit_customer"
          ? "Admin → Identity & Trust → Verification Sessions"
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

/**
 * A Paystack charge for a product order succeeded on the gateway, but
 * `recordProductOrderPayment` refused to settle it (e.g. the order was
 * already cancelled/failed/refunded by the time the webhook or saved-card
 * verify ran). The customer's card was charged; the order will not show as
 * paid until ops manually reconciles (refund or force-settle).
 */
export function slackNotifyProductOrderPaymentNotRecorded(params: {
  tenantId?: string | null;
  productOrderId: string;
  reference?: string | null;
  source?: string | null;
  amountMajor?: number | null;
  currency?: string | null;
}) {
  void tryNotifySlackEvent({
    tenantId: params.tenantId ?? "platform",
    environment: eventEnv(),
    eventKey: SLACK_EVENT_KEYS.PRODUCT_ORDER_PAYMENT_NOT_RECORDED,
    dedupeKey: `product_order:${params.productOrderId}:payment_not_recorded:${params.reference ?? "unknown"}`,
    entityType: "product_order",
    entityId: params.productOrderId,
    title: "Product order charged but payment not recorded",
    detailLines: [
      `Order: ${params.productOrderId.slice(0, 8)}…`,
      params.reference ? `Payment ref: ${params.reference}` : null,
      params.amountMajor != null
        ? `Amount: ${params.amountMajor}${params.currency ? ` ${params.currency}` : ""}`
        : null,
      params.source ? `Source: ${params.source}` : null,
      "The customer's card was charged. Action: review in Admin → Product orders and refund or force-settle.",
    ].filter(Boolean) as string[],
    actionUrl: `/product-orders/${params.productOrderId}`,
  }).catch((err) => {
    console.error("[slack] product_order payment_not_recorded notify error", err);
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

/** Manual upload, SumSub, or Didit outcome that still needs admin review. */
export function slackNotifyVerificationNeedsReview(params: {
  tenantId: string;
  verificationId: string;
  documentType?: string | null;
  source?: "manual" | "sumsub_customer" | "sumsub_provider" | "didit_customer" | "didit_provider" | "didit_kyb";
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
        : params.source === "didit_customer"
          ? "Didit (customer)"
          : params.source === "didit_provider"
            ? "Didit (provider)"
            : params.source === "didit_kyb"
              ? "Didit (KYB)"
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
        : params.source === "didit_provider" || params.source === "didit_customer"
          ? "Action: Admin → Identity & Trust → Verification Sessions"
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
/** Payment gateway webhook rejected — invalid HMAC/signature (persisted to webhook_events). */
export function slackNotifyWebhookSignatureRejected(params: {
  source: "paystack" | "stripe" | "flutterwave";
  eventId: string;
  errorMessage: string;
  attemptCount?: number;
}) {
  void tryNotifySlackEvent({
    tenantId: "platform",
    environment: eventEnv(),
    eventKey: SLACK_EVENT_KEYS.PAYMENTS_WEBHOOK_SIGNATURE_REJECTED,
    dedupeKey: `webhook-sig:${params.source}:${params.eventId}`,
    entityType: "webhook_event",
    entityId: params.eventId,
    title: "Payment webhook signature rejected",
    detailLines: [
      `Source: ${params.source}`,
      params.attemptCount != null ? `Attempts: ${params.attemptCount}` : null,
      `Error: ${params.errorMessage.slice(0, 300)}`,
      "Action: verify webhook secret, WAF headers, and gateway dashboard",
    ].filter(Boolean) as string[],
    actionUrl: "/control-plane",
  }).catch((err) => {
    console.error("[slack] webhook signature rejected notify error", err);
  });
}

/**
 * Vercel cron job failed (top-level handler catch or `withCronLock` failure path).
 * Deduped per job per hour (`cron:<job>:failed:<YYYY-MM-DDTHH>`).
 */
export function slackNotifyWorkflowFailed(params: {
  workflow: string;
  error: string;
  runId?: string | null;
  domainType?: string | null;
  domainId?: string | null;
  tenantId?: string | null;
}) {
  const hourKey = new Date().toISOString().slice(0, 13);
  void tryNotifySlackEvent({
    tenantId: params.tenantId ?? "platform",
    environment: eventEnv(),
    eventKey: SLACK_EVENT_KEYS.OPS_WORKFLOW_FAILED,
    dedupeKey: `workflow:${params.workflow}:failed:${params.runId ?? params.domainId ?? hourKey}`,
    entityType: "workflow_run",
    entityId: params.runId ?? params.workflow,
    title: "Workflow run failed",
    detailLines: [
      `Workflow: ${params.workflow}`,
      params.domainType && params.domainId ? `Domain: ${params.domainType}/${params.domainId}` : null,
      params.runId ? `Run: ${params.runId}` : null,
      `Error: ${params.error.slice(0, 300)}`,
      "Action: Admin → Workflow runs; inspect the Vercel run trace",
    ].filter(Boolean) as string[],
    actionUrl: "/workflow-runs",
  }).catch((err) => {
    console.error("[slack] workflow failed notify error", err);
  });
}

export function slackNotifyCronJobFailed(params: {
  cronJob: string;
  error: string;
  tenantId?: string | null;
  runId?: number | null;
}) {
  const hourKey = new Date().toISOString().slice(0, 13);
  void tryNotifySlackEvent({
    tenantId: params.tenantId ?? "platform",
    environment: eventEnv(),
    eventKey: SLACK_EVENT_KEYS.OPS_CRON_FAILED,
    dedupeKey: `cron:${params.cronJob}:failed:${hourKey}`,
    entityType: "cron_job",
    entityId: params.cronJob,
    title: "Cron job failed",
    detailLines: [
      `Job: ${params.cronJob}`,
      params.runId != null ? `Run: cron_runs #${params.runId}` : null,
      `Error: ${params.error.slice(0, 300)}`,
      "Action: Admin → Cron runs; check Vercel cron logs and retry if needed",
    ].filter(Boolean) as string[],
    actionUrl: "/cron-runs",
  }).catch((err) => {
    console.error("[slack] cron job failed notify error", err);
  });
}

/**
 * A customer/provider payment attempt failed at the gateway (charge.failed,
 * payment_intent.payment_failed, saved-card charge declined, …).
 * Dedupe: one alert per reference (or per booking/order when no reference).
 *
 * Call sites (wired by the payments owner): Paystack `processFailedPayment`
 * (_handlers/charge-success.ts), Stripe `payment_intent.payment_failed` branch,
 * `/api/payments/charge-saved-card` decline path.
 */
export function slackNotifyPaymentFailed(params: {
  tenantId?: string | null;
  source: "paystack" | "stripe" | "flutterwave" | "saved_card" | "terminal";
  reference?: string | null;
  bookingId?: string | null;
  orderId?: string | null;
  amountMajor?: number | null;
  currency?: string | null;
  reason?: string | null;
  customerEmail?: string | null;
}) {
  const entityId = params.reference ?? params.bookingId ?? params.orderId ?? "unknown";
  void tryNotifySlackEvent({
    tenantId: params.tenantId ?? "platform",
    environment: eventEnv(),
    eventKey: SLACK_EVENT_KEYS.FINANCE_PAYMENT_FAILED,
    dedupeKey: `payment:${params.source}:${entityId}:failed`,
    entityType: params.bookingId ? "booking" : params.orderId ? "order" : "payment",
    entityId,
    title: "Payment failed",
    detailLines: [
      `Gateway: ${params.source}`,
      params.reference ? `Reference: ${params.reference}` : null,
      params.bookingId ? `Booking ${params.bookingId.slice(0, 8)}…` : null,
      params.orderId ? `Order ${params.orderId.slice(0, 8)}…` : null,
      params.amountMajor != null
        ? `Amount: ${params.amountMajor.toFixed(2)}${params.currency ? ` ${params.currency}` : ""}`
        : null,
      params.reason ? `Reason: ${params.reason.slice(0, 200)}` : null,
      params.customerEmail ? `Customer: ${params.customerEmail}` : null,
      "Action: Admin → Webhooks → Inbound for the raw event; follow up with the customer if the booking is pending",
    ].filter(Boolean) as string[],
    actionUrl: params.bookingId ? `/bookings/${params.bookingId}` : "/webhooks/inbound",
  }).catch((err) => {
    console.error("[slack] payment failed notify error", err);
  });
}

export const DEFAULT_HIGH_VALUE_REFUND_THRESHOLD_MAJOR = 5000;

/**
 * Reads `platform_settings.settings.finance.high_value_refund_threshold` (major units),
 * defaulting to R5000. Best-effort: any read error returns the default.
 */
export async function resolveHighValueRefundThreshold(tenantId?: string | null): Promise<number> {
  try {
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    const supabase = getSupabaseAdmin();
    let query = supabase
      .from("platform_settings")
      .select("settings")
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1);
    query = tenantId ? query.eq("tenant_id", tenantId) : query.is("tenant_id", null);
    let { data } = await query.maybeSingle();
    if (!data && tenantId) {
      const fallback = await supabase
        .from("platform_settings")
        .select("settings")
        .eq("is_active", true)
        .is("tenant_id", null)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      data = fallback.data;
    }
    const settings = (data as { settings?: Record<string, unknown> } | null)?.settings ?? {};
    const finance = (settings.finance as Record<string, unknown> | undefined) ?? {};
    const raw = Number(finance.high_value_refund_threshold);
    return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_HIGH_VALUE_REFUND_THRESHOLD_MAJOR;
  } catch {
    return DEFAULT_HIGH_VALUE_REFUND_THRESHOLD_MAJOR;
  }
}

/**
 * A refund at or above the configured threshold was requested/approved/processed.
 * No-op when below threshold. Dedupe: one alert per refund per stage.
 *
 * Call sites: admin refund approve/process routes (wired here where owned),
 * Paystack `refund.processed` handler (_handlers/refund-events.ts), Stripe `charge.refunded`.
 */
export async function slackNotifyHighValueRefund(params: {
  tenantId?: string | null;
  refundId: string;
  bookingId?: string | null;
  amountMajor: number;
  currency?: string | null;
  stage: "requested" | "approved" | "processed";
  actorUserId?: string | null;
  reason?: string | null;
  thresholdMajor?: number;
}): Promise<{ notified: boolean; thresholdMajor: number }> {
  const thresholdMajor =
    params.thresholdMajor ?? (await resolveHighValueRefundThreshold(params.tenantId ?? null));
  if (!Number.isFinite(params.amountMajor) || params.amountMajor < thresholdMajor) {
    return { notified: false, thresholdMajor };
  }
  await tryNotifySlackEvent({
    tenantId: params.tenantId ?? "platform",
    environment: eventEnv(),
    eventKey: SLACK_EVENT_KEYS.FINANCE_REFUND_HIGH_VALUE,
    dedupeKey: `refund:${params.refundId}:high_value:${params.stage}`,
    entityType: "booking_refund",
    entityId: params.refundId,
    title: `High-value refund ${params.stage}`,
    detailLines: [
      `Amount: ${params.amountMajor.toFixed(2)}${params.currency ? ` ${params.currency}` : ""} (threshold ${thresholdMajor.toFixed(0)})`,
      params.bookingId ? `Booking ${params.bookingId.slice(0, 8)}…` : null,
      params.actorUserId ? `By: ${params.actorUserId.slice(0, 8)}…` : null,
      params.reason ? `Reason: ${params.reason.slice(0, 200)}` : null,
      "Action: Admin → Refunds — confirm second approver reviewed",
    ].filter(Boolean) as string[],
    actionUrl: "/refunds",
  }).catch((err) => {
    console.error("[slack] high value refund notify error", err);
  });
  return { notified: true, thresholdMajor };
}

/**
 * A provider subscription churned (cancelled and expired, dunning exhausted, or
 * downgraded to free after failed retries). Dedupe: one alert per subscription per reason.
 *
 * Call sites: crons `expire-cancelled-subscriptions`, `retry-subscription-payments`
 * (stop condition), and `reverseProviderSubscriptionPayment` chargeback path.
 */
export function slackNotifySubscriptionChurned(params: {
  tenantId?: string | null;
  subscriptionId: string;
  providerId?: string | null;
  providerName?: string | null;
  planName?: string | null;
  reason: "cancelled_expired" | "dunning_exhausted" | "chargeback" | "downgraded" | "other";
  mrrMajor?: number | null;
  currency?: string | null;
}) {
  void tryNotifySlackEvent({
    tenantId: params.tenantId ?? "platform",
    environment: eventEnv(),
    eventKey: SLACK_EVENT_KEYS.SUBSCRIPTION_CHURNED,
    dedupeKey: `subscription:${params.subscriptionId}:churned:${params.reason}`,
    entityType: "provider_subscription",
    entityId: params.subscriptionId,
    title: "Provider subscription churned",
    detailLines: [
      params.providerName ? `Provider: ${params.providerName}` : params.providerId ? `Provider ${params.providerId.slice(0, 8)}…` : null,
      params.planName ? `Plan: ${params.planName}` : null,
      `Reason: ${params.reason.replace(/_/g, " ")}`,
      params.mrrMajor != null
        ? `MRR lost: ${params.mrrMajor.toFixed(2)}${params.currency ? ` ${params.currency}` : ""}`
        : null,
      "Action: Admin → Provider Subscriptions — consider win-back outreach",
    ].filter(Boolean) as string[],
    actionUrl: params.providerId ? `/providers/${params.providerId}` : "/provider-subscriptions",
  }).catch((err) => {
    console.error("[slack] subscription churned notify error", err);
  });
}

/**
 * Fleet-wide unrecognized online payments (completed booking_payments without a
 * finance_transactions.payment row) exceeded zero after the reconcile sweep.
 * Dedupe: one alert per day per tenant.
 *
 * Call site: cron `reconcile-online-charge-ledger` after `reconcileOnlineChargeLedger`
 * returns (`needsReview.length + errors.length > 0`), and the Ledger Health API when
 * an admin loads it with a non-zero count (already wired here).
 */
export function slackNotifyUnrecognizedPayments(params: {
  tenantId?: string | null;
  count: number;
  amountMajor?: number | null;
  currency?: string | null;
  needsReview?: number;
  errors?: number;
  source?: string;
}) {
  if (params.count <= 0) return;
  const dayKey = new Date().toISOString().slice(0, 10);
  void tryNotifySlackEvent({
    tenantId: params.tenantId ?? "platform",
    environment: eventEnv(),
    eventKey: SLACK_EVENT_KEYS.FINANCE_UNRECOGNIZED_PAYMENTS,
    dedupeKey: `unrecognized_payments:${params.tenantId ?? "platform"}:${dayKey}`,
    entityType: "ledger_health",
    entityId: params.tenantId ?? "platform",
    title: "Unrecognized online payments need ledger repair",
    detailLines: [
      `Count: ${params.count}`,
      params.amountMajor != null
        ? `Amount: ${params.amountMajor.toFixed(2)}${params.currency ? ` ${params.currency}` : ""}`
        : null,
      params.needsReview != null ? `Needs review: ${params.needsReview}` : null,
      params.errors != null ? `Errors: ${params.errors}` : null,
      params.source ? `Source: ${params.source}` : null,
      "Action: Admin → Finance → Ledger Repair (propose → superadmin approve)",
    ].filter(Boolean) as string[],
    actionUrl: "/finance/ledger-repair",
  }).catch((err) => {
    console.error("[slack] unrecognized payments notify error", err);
  });
}

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
