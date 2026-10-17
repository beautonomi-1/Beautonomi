import type { CancellationPolicy } from "@/lib/bookings/cancellation-policy";
import { canCancelBooking } from "@/lib/bookings/cancellation-policy";
import type { BookingPaymentForRefundCap } from "@/lib/bookings/booking-refund-limits";
import { splitCollectedByRail } from "@/lib/bookings/payment-collected-classifier";
import {
  mergeEffectiveCancellationPolicy,
  snapshotFromJson,
  type CancellationPolicySnapshot,
} from "@/lib/bookings/effective-cancellation-policy";
import { computeCancellationRefundAmount, roundCurrency2 } from "@/lib/bookings/refund-processing";

export type CancelActor =
  | "customer"
  | "portal"
  | "provider_customer_requested"
  | "provider"
  | "admin"
  | "no_show";

export type CancelBlockCode =
  | "ALREADY_CANCELLED"
  | "CANCELLATION_BLOCKED"
  | "NO_SHOW_TOO_EARLY"
  | "SERVICE_STARTED";

export type PenaltyWaivedReason =
  | "pending"
  | "grace"
  | "provider_rescheduled"
  | "no_penalty_policy"
  | "provider_cancelled";

export interface ResolveCancellationOutcomeInput {
  booking: {
    id: string;
    status: string;
    created_at: string;
    scheduled_at: string;
    location_type: "at_salon" | "at_home";
    total_amount?: number | null;
    tip_amount?: number | null;
    total_paid?: number | null;
    total_refunded?: number | null;
    current_stage?: string | null;
    cancellation_policy_snapshot?: unknown;
    provider_rescheduled_at?: string | null;
  };
  payments: BookingPaymentForRefundCap[];
  currentPolicy: CancellationPolicy | null;
  providerNoShow?: { enabled: boolean; amount: number };
  actor: CancelActor;
  now?: Date;
  providerRescheduled?: boolean;
  explicitCancellationFee?: number | null;
  platformRefunded?: number;
  inPersonRefunded?: number;
}

export interface CancellationOutcome {
  allowed: boolean;
  blockReason?: string;
  blockCode?: CancelBlockCode;
  isLate: boolean;
  penaltyWaivedReason?: PenaltyWaivedReason;
  platformCollected: number;
  inPersonCollected: number;
  feeRetained: number;
  walletRefund: number;
  inPersonRefundDue: number;
  policy: CancellationPolicy & {
    no_show_fee_enabled: boolean;
    no_show_fee_amount: number;
  };
  noShowAvailableAt?: string;
}

const SELF_CANCEL_BLOCKED_STATUSES = new Set([
  "cancelled",
  "completed",
  "no_show",
  "in_progress",
  "started",
  "waiting",
  "checked_in",
]);

const BLOCKED_STAGES = new Set([
  "client_arrived",
  "provider_on_way",
  "provider_arrived",
  "service_started",
  "service_completed",
]);

function feeBasisTotal(booking: ResolveCancellationOutcomeInput["booking"]): number {
  const total = Math.max(0, Number(booking.total_amount ?? 0));
  const tip = Math.max(0, Number(booking.tip_amount ?? 0));
  return roundCurrency2(Math.max(0, total - tip));
}

function isPendingStatus(status: string): boolean {
  return status === "pending" || status === "pending_payment";
}

export function computeNoShowAvailableAt(scheduledAt: string): Date {
  return new Date(new Date(scheduledAt).getTime() + 10 * 60 * 1000);
}

export function resolveCancellationOutcome(
  input: ResolveCancellationOutcomeInput,
): CancellationOutcome {
  const now = input.now ?? new Date();
  const snapshot = snapshotFromJson(input.booking.cancellation_policy_snapshot);
  const policy = mergeEffectiveCancellationPolicy(
    snapshot,
    input.currentPolicy,
    input.providerNoShow,
  );

  const { platformCollected, inPersonCollected } = splitCollectedByRail(
    input.payments,
    input.platformRefunded ?? 0,
    input.inPersonRefunded ?? 0,
  );

  const scheduledAt = new Date(input.booking.scheduled_at);
  const noShowAt = computeNoShowAvailableAt(input.booking.scheduled_at);

  const baseBlocked = (): CancellationOutcome => ({
    allowed: false,
    blockReason:
      "Your appointment has started or passed — contact the provider or support.",
    blockCode: "CANCELLATION_BLOCKED",
    isLate: false,
    platformCollected,
    inPersonCollected,
    feeRetained: 0,
    walletRefund: 0,
    inPersonRefundDue: inPersonCollected,
    policy,
    noShowAvailableAt: noShowAt.toISOString(),
  });

  if (input.actor === "no_show") {
    if (now < noShowAt) {
      return {
        ...baseBlocked(),
        blockReason: "No-show can only be marked at least 10 minutes after the appointment time.",
        blockCode: "NO_SHOW_TOO_EARLY",
        allowed: false,
      };
    }
  }

  const isSelfCancel =
    input.actor === "customer" ||
    input.actor === "portal" ||
    input.actor === "provider_customer_requested";
  if (input.actor === "customer" || input.actor === "portal") {
    const status = input.booking.status === "started" ? "in_progress" : input.booking.status;
    if (SELF_CANCEL_BLOCKED_STATUSES.has(status)) {
      return {
        ...baseBlocked(),
        blockReason:
          status === "cancelled"
            ? "This booking has already been cancelled"
            : baseBlocked().blockReason,
        blockCode: status === "cancelled" ? "ALREADY_CANCELLED" : "CANCELLATION_BLOCKED",
      };
    }
    const stage = (input.booking.current_stage ?? "").toLowerCase();
    if (stage && BLOCKED_STAGES.has(stage)) {
      return baseBlocked();
    }
    if (now >= scheduledAt) {
      return baseBlocked();
    }
  }

  if (input.booking.status === "cancelled") {
    return {
      ...baseBlocked(),
      blockReason: "This booking has already been cancelled",
      blockCode: "ALREADY_CANCELLED",
    };
  }

  const providerMoved =
    input.providerRescheduled === true ||
    Boolean(input.booking.provider_rescheduled_at);

  let penaltyWaivedReason: PenaltyWaivedReason | undefined;
  if (isPendingStatus(input.booking.status)) {
    penaltyWaivedReason = "pending";
  } else if (providerMoved) {
    penaltyWaivedReason = "provider_rescheduled";
  } else if (input.actor === "provider" || input.actor === "admin") {
    penaltyWaivedReason = "provider_cancelled";
  } else if ((policy.refund_percentage ?? 0) >= 100 && policy.hours_before_cutoff <= 0) {
    penaltyWaivedReason = "no_penalty_policy";
  }

  const graceEnd = new Date(
    new Date(input.booking.created_at).getTime() +
      policy.grace_window_minutes * 60 * 1000,
  );
  const graceCap = scheduledAt.getTime();
  const effectiveGraceEnd = new Date(Math.min(graceEnd.getTime(), graceCap));
  if (!penaltyWaivedReason && now <= effectiveGraceEnd) {
    penaltyWaivedReason = "grace";
  }

  const check = canCancelBooking(
    {
      id: input.booking.id,
      created_at: input.booking.created_at,
      scheduled_at: input.booking.scheduled_at,
      location_type: input.booking.location_type,
    },
    policy,
    now,
    { forbidLateSelfService: false },
  );

  const isLate = check.isLateCancellation === true && !penaltyWaivedReason;

  const basis = feeBasisTotal(input.booking);
  const tip = Math.max(0, Number(input.booking.tip_amount ?? 0));
  const tipPaidOnline = Math.min(tip, Math.max(0, platformCollected - basis));
  const feeCap = roundCurrency2(Math.max(0, Math.min(basis, platformCollected - tipPaidOnline)));

  if (input.actor === "no_show") {
    let fee = policy.no_show_fee_enabled ? Number(policy.no_show_fee_amount ?? 0) : 0;
    fee = roundCurrency2(Math.min(Math.max(0, fee), feeCap));
    const walletRefund = roundCurrency2(Math.max(0, platformCollected - fee));
    return {
      allowed: true,
      isLate: false,
      platformCollected,
      inPersonCollected,
      feeRetained: fee,
      walletRefund,
      inPersonRefundDue: inPersonCollected,
      policy,
      noShowAvailableAt: noShowAt.toISOString(),
    };
  }

  if (input.actor === "provider" || input.actor === "admin") {
    const adminFee =
      input.actor === "admin" && input.explicitCancellationFee != null
        ? roundCurrency2(Math.min(Math.max(0, Number(input.explicitCancellationFee) || 0), feeCap))
        : 0;
    return {
      allowed: true,
      isLate: false,
      penaltyWaivedReason: adminFee > 0 ? undefined : "provider_cancelled",
      platformCollected,
      inPersonCollected,
      feeRetained: adminFee,
      walletRefund: roundCurrency2(Math.max(0, platformCollected - adminFee)),
      inPersonRefundDue: inPersonCollected,
      policy,
      noShowAvailableAt: noShowAt.toISOString(),
    };
  }

  const policyRefund = penaltyWaivedReason
    ? basis
    : computeCancellationRefundAmount(basis, policy, isLate);
  const theoreticalFee = roundCurrency2(Math.max(0, basis - policyRefund));
  const feeRetained = roundCurrency2(Math.min(theoreticalFee, feeCap));
  const walletRefund = roundCurrency2(Math.max(0, platformCollected - feeRetained));

  return {
    allowed: check.allowed,
    blockReason: check.allowed ? undefined : check.reason,
    blockCode: check.allowed ? undefined : "CANCELLATION_BLOCKED",
    isLate,
    penaltyWaivedReason,
    platformCollected,
    inPersonCollected,
    feeRetained,
    walletRefund,
    inPersonRefundDue: inPersonCollected,
    policy,
    noShowAvailableAt: noShowAt.toISOString(),
  };
}

export function outcomeToPreviewPayload(outcome: CancellationOutcome) {
  return {
    allowed: outcome.allowed,
    reason: outcome.blockReason,
    block_code: outcome.blockCode,
    is_late_cancellation: outcome.isLate,
    expected_cancellation_fee: outcome.feeRetained,
    expected_wallet_refund: outcome.walletRefund,
    in_person_refund_due: outcome.inPersonRefundDue,
    penalty_waived_reason: outcome.penaltyWaivedReason,
    platform_collected: outcome.platformCollected,
    no_show_available_at: outcome.noShowAvailableAt,
    policy: outcome.policy,
  };
}
