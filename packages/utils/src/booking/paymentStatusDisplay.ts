export type BookingDisplayTone = "success" | "warning" | "danger" | "info" | "neutral";

export type BookingLifecycleDisplay = {
  label: string;
  title: string;
  description: string;
  tone: BookingDisplayTone;
  isAwaitingProviderConfirmation: boolean;
  isPaymentInProgress: boolean;
};

export type BookingPaymentDisplay = {
  label: string;
  description: string;
  tone: BookingDisplayTone;
  isPaymentSettled: boolean;
  isDepositPaid: boolean;
  isPaymentPending: boolean;
};

/**
 * Resolve the *effective* lifecycle status. `pending_payment` is meant to be a
 * transient state during the customer's payment redirect — once payment has
 * settled (`payment_status` is `paid` / `partially_paid`, or `outstandingBalance`
 * is 0), the booking should display as if it had advanced to `pending`
 * (awaiting provider confirmation). The DB trigger and async repair both move
 * the row to `pending`, but UI sometimes sees the stale row before that — this
 * function makes display behave correctly even then.
 */
export function resolveEffectiveBookingLifecycleStatus(input: {
  status?: string | null;
  paymentStatus?: string | null;
  outstandingBalance?: number | null;
}): string {
  const status = String(input.status || "pending").toLowerCase();
  if (status !== "pending_payment") return status;

  const paymentStatus = String(input.paymentStatus || "").toLowerCase();
  const isPaid = paymentStatus === "paid" || paymentStatus === "partially_paid";
  const hasOutstanding =
    input.outstandingBalance !== undefined && input.outstandingBalance !== null;
  const outstanding = Math.max(0, Number(input.outstandingBalance || 0));
  if (isPaid || (hasOutstanding && outstanding <= 0.005)) return "pending";
  return status;
}

export function getBookingLifecycleDisplay(input: {
  status?: string | null;
  providerName?: string | null;
  /** Optional — when provided, a stuck `pending_payment` with settled payment is treated as `pending`. */
  paymentStatus?: string | null;
  /** Optional — outstanding balance is checked alongside `paymentStatus` when resolving `pending_payment`. */
  outstandingBalance?: number | null;
}): BookingLifecycleDisplay {
  const status = resolveEffectiveBookingLifecycleStatus({
    status: input.status,
    paymentStatus: input.paymentStatus,
    outstandingBalance: input.outstandingBalance,
  });
  const providerName = input.providerName?.trim() || "your provider";

  if (status === "pending_payment") {
    return {
      label: "Payment pending",
      title: "Payment pending",
      description: "Your booking request is waiting for payment confirmation.",
      tone: "warning",
      isAwaitingProviderConfirmation: false,
      isPaymentInProgress: true,
    };
  }

  if (status === "pending") {
    return {
      label: "Awaiting provider confirmation",
      title: "Booking request received",
      description: `Your booking is awaiting confirmation from ${providerName}.`,
      tone: "warning",
      isAwaitingProviderConfirmation: true,
      isPaymentInProgress: false,
    };
  }

  if (status === "confirmed") {
    return {
      label: "Confirmed",
      title: "Booking confirmed",
      description: `Your booking with ${providerName} is confirmed.`,
      tone: "success",
      isAwaitingProviderConfirmation: false,
      isPaymentInProgress: false,
    };
  }

  if (status === "completed") {
    return {
      label: "Completed",
      title: "Service completed",
      description: "Your service has been completed.",
      tone: "info",
      isAwaitingProviderConfirmation: false,
      isPaymentInProgress: false,
    };
  }

  if (status === "cancelled") {
    return {
      label: "Cancelled",
      title: "Booking cancelled",
      description: "This booking has been cancelled.",
      tone: "danger",
      isAwaitingProviderConfirmation: false,
      isPaymentInProgress: false,
    };
  }

  if (status === "no_show") {
    return {
      label: "Marked as no-show",
      title: "Marked as no-show",
      description: "This appointment was marked as a no-show.",
      tone: "warning",
      isAwaitingProviderConfirmation: false,
      isPaymentInProgress: false,
    };
  }

  if (status === "started" || status === "in_progress") {
    return {
      label: "In progress",
      title: "Service in progress",
      description: "Your provider has started this service.",
      tone: "info",
      isAwaitingProviderConfirmation: false,
      isPaymentInProgress: false,
    };
  }

  return {
    label: status.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()),
    title: "Booking update",
    description: "Your booking status has been updated.",
    tone: "neutral",
    isAwaitingProviderConfirmation: false,
    isPaymentInProgress: false,
  };
}

export function getBookingPaymentDisplay(input: {
  paymentStatus?: string | null;
  paymentProvider?: string | null;
  outstandingBalance?: number | null;
  paymentOption?: string | null;
  depositRequired?: boolean | null;
}): BookingPaymentDisplay {
  const paymentStatus = String(input.paymentStatus || "pending").toLowerCase();
  const paymentProvider = String(input.paymentProvider || "").toLowerCase();
  const hasOutstandingBalance = input.outstandingBalance !== undefined && input.outstandingBalance !== null;
  const outstanding = Math.max(0, Number(input.outstandingBalance || 0));
  const isCash = paymentProvider === "cash";
  const isDeposit = input.depositRequired === true || input.paymentOption === "deposit";

  if (isCash && paymentStatus === "pending") {
    return {
      label: "Pay at appointment",
      description: "Payment will be collected at the appointment.",
      tone: "warning",
      isPaymentSettled: false,
      isDepositPaid: false,
      isPaymentPending: true,
    };
  }

  if (paymentStatus === "paid" || (paymentStatus === "pending" && hasOutstandingBalance && outstanding <= 0)) {
    return {
      label: "Paid in full",
      description: "Payment has been received.",
      tone: "success",
      isPaymentSettled: true,
      isDepositPaid: false,
      isPaymentPending: false,
    };
  }

  if (paymentStatus === "partially_paid") {
    return {
      label: isDeposit ? "Deposit paid" : "Partially paid",
      description: isDeposit
        ? "Your deposit has been received. The remaining balance is due later."
        : "A partial payment has been received.",
      tone: "warning",
      isPaymentSettled: false,
      isDepositPaid: true,
      isPaymentPending: false,
    };
  }

  if (paymentStatus === "partially_refunded") {
    return {
      label: "Partially refunded",
      description: "This booking has a partial refund recorded.",
      tone: "warning",
      isPaymentSettled: outstanding <= 0,
      isDepositPaid: false,
      isPaymentPending: outstanding > 0,
    };
  }

  if (paymentStatus === "refunded") {
    return {
      label: "Refunded",
      description: "This booking payment has been refunded.",
      tone: "neutral",
      isPaymentSettled: false,
      isDepositPaid: false,
      isPaymentPending: false,
    };
  }

  return {
    label: "Payment pending",
    description: "Payment has not been confirmed yet.",
    tone: "warning",
    isPaymentSettled: false,
    isDepositPaid: false,
    isPaymentPending: true,
  };
}
