export type ProviderBookingCreatedSuccessInput = {
  status?: string | null;
  /** Raw DB lifecycle status when available (e.g. pending_payment). */
  dbStatus?: string | null;
  paymentStatus?: string | null;
  clientName?: string | null;
  date?: string | null;
  time?: string | null;
  bookingNumber?: string | null;
  warnings?: string[];
  isWalkIn?: boolean;
  sendNotification?: boolean;
};

function isPaymentUnsettled(paymentStatus?: string | null): boolean {
  const ps = (paymentStatus ?? "").trim().toLowerCase();
  return ps === "pending" || ps === "partially_paid" || ps === "unpaid";
}

/** Resolve lifecycle status for CTA decisions (prefer raw DB status when supplied). */
export function resolveBookingLifecycleStatus(input: {
  status?: string | null;
  dbStatus?: string | null;
}): string {
  const db = normalizeStatus(input.dbStatus);
  if (db) return db;
  return normalizeStatus(input.status);
}

export type ProviderBookingCreatedSuccessModel = {
  title: string;
  subtitle: string;
  bannerTitle?: string;
  bannerBody?: string;
  bannerTone: "amber" | "green" | "neutral";
  iconName: "checkmark-circle" | "time-outline" | "card-outline";
  showConfirmCta: boolean;
  showReviewCta: boolean;
  showViewCta: boolean;
  confirmBlockedReason?: string;
  summaryLines: string[];
};

function normalizeStatus(status?: string | null): string {
  return (status ?? "").trim().toLowerCase();
}

/** True when the provider should confirm before the visit is fully scheduled. */
export function needsProviderConfirmation(
  status?: string | null,
  dbStatus?: string | null,
): boolean {
  const s = resolveBookingLifecycleStatus({ status, dbStatus });
  return s === "pending" || s === "pending_payment";
}

/** True when payment must clear before confirmation is allowed. */
export function isPendingPaymentBlocked(
  status?: string | null,
  dbStatus?: string | null,
  paymentStatus?: string | null,
): boolean {
  const lifecycle = resolveBookingLifecycleStatus({ status, dbStatus });
  if (lifecycle === "pending_payment" && isPaymentUnsettled(paymentStatus)) {
    return true;
  }
  return false;
}

export function buildProviderBookingCreatedSuccessModel(
  input: ProviderBookingCreatedSuccessInput,
): ProviderBookingCreatedSuccessModel {
  const needsConfirm = needsProviderConfirmation(input.status, input.dbStatus);
  const pendingPayment = isPendingPaymentBlocked(
    input.status,
    input.dbStatus,
    input.paymentStatus,
  );
  const paymentNote =
    needsConfirm && !pendingPayment && isPaymentUnsettled(input.paymentStatus)
      ? " Payment is still outstanding — you can confirm now or collect it from booking details."
      : "";
  const clientLabel = (input.clientName ?? "").trim() || (input.isWalkIn ? "Walk-in client" : "Client");
  const summaryLines: string[] = [clientLabel];
  if (input.date?.trim()) summaryLines.push(input.date.trim());
  if (input.time?.trim()) summaryLines.push(input.time.trim());
  if (input.bookingNumber?.trim()) summaryLines.push(`Ref ${input.bookingNumber.trim()}`);

  if (pendingPayment) {
    return {
      title: "Booking created",
      subtitle: "Payment must clear before you can confirm this appointment.",
      bannerTitle: "Awaiting payment",
      bannerBody:
        "The appointment is reserved but not confirmed. Collect or verify payment, then confirm from booking details.",
      bannerTone: "amber",
      iconName: "card-outline",
      showConfirmCta: false,
      showReviewCta: true,
      showViewCta: false,
      confirmBlockedReason: "Confirmation is blocked until payment clears.",
      summaryLines,
    };
  }

  if (needsConfirm) {
    const notifyNote =
      input.sendNotification === false
        ? " The client was not notified at creation; confirming will send the confirmation."
        : "";
    return {
      title: "Booking created",
      subtitle: "Review the details below and confirm when you're ready.",
      bannerTitle: "Confirmation needed",
      bannerBody: `This appointment isn't confirmed yet. Confirm it so your client knows the slot is reserved.${notifyNote}${paymentNote}`,
      bannerTone: "amber",
      iconName: "time-outline",
      showConfirmCta: true,
      showReviewCta: true,
      showViewCta: false,
      summaryLines,
    };
  }

  return {
    title: input.isWalkIn ? "Walk-in booked" : "Booking created",
    subtitle: "Appointment is on your calendar.",
    bannerTitle: "Confirmed",
    bannerBody: "This appointment is confirmed and ready for your team.",
    bannerTone: "green",
    iconName: "checkmark-circle",
    showConfirmCta: false,
    showReviewCta: false,
    showViewCta: true,
    summaryLines,
  };
}

/** Rebuild model after inline confirm succeeds. */
export function buildConfirmedAfterInlineConfirmModel(
  input: Omit<ProviderBookingCreatedSuccessInput, "status">,
): ProviderBookingCreatedSuccessModel {
  return buildProviderBookingCreatedSuccessModel({ ...input, status: "booked" });
}
