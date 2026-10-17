import type { CancellationPolicy } from "@/lib/bookings/cancellation-policy";
import {
  describeCancellationRefund,
  roundCurrency2,
} from "@/lib/bookings/refund-processing";
import type {
  CancellationOutcome,
  CancelActor,
  CancelBlockCode,
} from "@/lib/bookings/resolve-cancellation-outcome";
import type {
  CancellationSettledBy,
  SettleBookingCancellationParams,
} from "@/lib/bookings/settle-booking-cancellation";

export function mapCancelActorToSettledBy(actor: CancelActor): CancellationSettledBy {
  if (actor === "provider_customer_requested") return "customer";
  if (actor === "no_show") return "no_show";
  return actor;
}

export function providerCancelInitiatorToActor(
  initiator: string | null | undefined,
): CancelActor {
  return initiator === "customer_requested" ? "provider_customer_requested" : "provider";
}

export function cancellationBlockedHttpStatus(code?: CancelBlockCode): number {
  if (code === "ALREADY_CANCELLED") return 400;
  if (code === "NO_SHOW_TOO_EARLY") return 409;
  if (code === "SERVICE_STARTED") return 403;
  return 403;
}

export function assertCancellationAllowed(outcome: CancellationOutcome): {
  ok: boolean;
  message: string;
  code: CancelBlockCode;
  httpStatus: number;
} {
  if (outcome.allowed) {
    return { ok: true, message: "", code: "CANCELLATION_BLOCKED", httpStatus: 200 };
  }
  return {
    ok: false,
    message: outcome.blockReason ?? "Cancellation not allowed",
    code: outcome.blockCode ?? "CANCELLATION_BLOCKED",
    httpStatus: cancellationBlockedHttpStatus(outcome.blockCode),
  };
}

/** Map resolveCancellationOutcome amounts into settleBookingCancellation inputs. */
export function settleParamsFromCancellationOutcome(
  outcome: CancellationOutcome,
  actor: CancelActor,
  base: Omit<
    SettleBookingCancellationParams,
    "policy" | "isLateCancellation" | "explicitCancellationFee" | "maxWalletCredit" | "cancelledBy"
  >,
): SettleBookingCancellationParams {
  return {
    ...base,
    cancelledBy: mapCancelActorToSettledBy(actor),
    policy: outcome.policy as CancellationPolicy,
    isLateCancellation: outcome.isLate,
    maxWalletCredit: outcome.platformCollected,
    explicitCancellationFee: outcome.feeRetained,
  };
}

export function describeRefundFromOutcome(
  outcome: CancellationOutcome,
  bookingTotal: number,
  currency: string,
): string {
  const base = describeCancellationRefund(
    outcome.policy,
    outcome.isLate,
    outcome.walletRefund,
    bookingTotal,
    currency,
    { inPersonRefundDue: outcome.inPersonRefundDue },
  );
  if (outcome.inPersonRefundDue > 0.01 && outcome.walletRefund > 0) {
    return `${base} ${currency} ${roundCurrency2(outcome.inPersonRefundDue).toFixed(2)} paid in person will be returned to you by the provider.`;
  }
  return base;
}
