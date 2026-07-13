/**
 * Shared logic for custom-offer cards rendered in chat threads.
 * Used by both the native (React Native) and web card implementations
 * so status derivation, badge text, and CTA gating are consistent.
 */

export type CustomOfferAttachmentBase = {
  type?: string;
  offer_id?: string;
  status?: string;
  booking_id?: string | null;
  expired?: boolean;
  withdrawn?: boolean;
  price?: number;
  currency?: string;
  duration_minutes?: number;
  preferred_start_at?: string | null;
  expiration_at?: string | null;
  /** Paystack payment reference — surfaced on finalize_failed so the customer can quote it to support. */
  payment_reference?: string | null;
  change_request_note?: string | null;
};

export type OfferStatusOverride = {
  status: string;
  booking_id: string | null;
};

export type EffectiveOfferStatus = {
  effStatus: string;
  effBookingId: string | null | undefined;
  isPaid: boolean;
  isPaymentPending: boolean;
  isExpired: boolean;
  isWithdrawn: boolean;
  isDeclined: boolean;
  isFinalizeFailed: boolean;
  isChangesRequested: boolean;
  isInactive: boolean;
  isMuted: boolean;
  badge: OfferBadge | null;
};

export type OfferBadge =
  | { type: "paid"; label: string }
  | { type: "processing"; label: string }
  | { type: "expired"; label: string }
  | { type: "declined"; label: string }
  | { type: "withdrawn"; label: string }
  | { type: "needs_support"; label: string }
  | { type: "changes_requested"; label: string };

export type StatusAccentColor =
  | "active"   // primary color
  | "paid"     // emerald
  | "pending"  // amber / yellow
  | "muted";   // gray

/**
 * Derive the effective state of a custom-offer card from the attachment blob
 * (which may lag the DB) and an optional fresh override fetched or received via realtime.
 */
export function getOfferEffectiveStatus(
  attachment: CustomOfferAttachmentBase,
  override?: OfferStatusOverride,
): EffectiveOfferStatus {
  const rawStatus = override?.status ?? attachment.status ?? "";
  const effStatus = rawStatus.toLowerCase();
  const effBookingId = override?.booking_id ?? attachment.booking_id ?? undefined;

  const isExpired = attachment.expired === true || effStatus === "expired";
  const isWithdrawn = attachment.withdrawn === true || effStatus === "withdrawn";
  const isDeclined = effStatus === "declined";
  const isChangesRequested = effStatus === "changes_requested";
  const isPaid = effStatus === "paid" || (!!effBookingId && effStatus !== "");
  const isPaymentPending = effStatus === "payment_pending";
  const isFinalizeFailed = effStatus === "finalize_failed";

  const isInactive = isExpired || isWithdrawn || isDeclined || isPaid || isFinalizeFailed;
  const isMuted = isWithdrawn || isExpired || isFinalizeFailed;

  let badge: OfferBadge | null = null;
  if (isWithdrawn) {
    badge = { type: "withdrawn", label: "Withdrawn" };
  } else if (isDeclined) {
    badge = { type: "declined", label: "Declined" };
  } else if (isChangesRequested) {
    badge = { type: "changes_requested", label: "Changes requested" };
  } else if (isExpired) {
    badge = { type: "expired", label: "Expired" };
  } else if (isPaid) {
    badge = { type: "paid", label: "Paid ✓" };
  } else if (isFinalizeFailed) {
    badge = { type: "needs_support", label: "Needs support" };
  } else if (isPaymentPending) {
    badge = { type: "processing", label: "Processing" };
  }

  return {
    effStatus,
    effBookingId,
    isPaid,
    isPaymentPending,
    isExpired,
    isWithdrawn,
    isDeclined,
    isFinalizeFailed,
    isChangesRequested,
    isInactive,
    isMuted,
    badge,
  };
}

/** Maps effective status to the accent stripe color category. */
export function getStatusAccentColor(s: EffectiveOfferStatus): StatusAccentColor {
  if (s.isPaid) return "paid";
  if (s.isMuted) return "muted";
  if (s.isPaymentPending) return "pending";
  return "active";
}

/** Whether a customer CTA (Accept & pay) should be shown. */
export function shouldShowCustomerAcceptCta(s: EffectiveOfferStatus, isMe: boolean): boolean {
  return !isMe && !s.isInactive && !s.isPaymentPending && !s.isPaid;
}

/** Whether the customer "Request changes" CTA should be shown. */
export function shouldShowCustomerRequestChangesCta(s: EffectiveOfferStatus, isMe: boolean): boolean {
  return !isMe && s.effStatus === "pending" && !s.isInactive && !s.isPaymentPending;
}

/** Whether the provider "Edit offer" CTA should be shown. */
export function shouldShowProviderEditCta(
  s: EffectiveOfferStatus,
  isMe: boolean,
  role: "provider" | "customer",
): boolean {
  return role === "provider" && isMe && (s.effStatus === "pending" || s.isChangesRequested) && !s.isInactive && !s.isPaymentPending;
}

/** Whether the "Resume payment" CTA should be shown to the customer. */
export function shouldShowCustomerResumeCta(s: EffectiveOfferStatus, isMe: boolean): boolean {
  return !isMe && s.isPaymentPending && !s.isInactive;
}

/** Whether the "View booking" CTA should be shown (any role). */
export function shouldShowViewBookingCta(s: EffectiveOfferStatus): boolean {
  return s.isPaid && !!s.effBookingId;
}

/** Whether the provider "Withdraw offer" CTA should be shown. */
export function shouldShowWithdrawCta(
  s: EffectiveOfferStatus,
  isMe: boolean,
  role: "provider" | "customer",
): boolean {
  // Do not show retract while customer payment is in flight — the API now
  // rejects payment_pending retracts to prevent a charge-without-booking race.
  return role === "provider" && isMe && (s.effStatus === "pending" || s.isChangesRequested) && !s.isInactive && !s.isPaymentPending;
}
