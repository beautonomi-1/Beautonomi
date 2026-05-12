import {
  dbTargetToPatchStatusField,
  filterStatusTargetsForBookingType,
  getAllowedTransitionTargets,
  isSalonOnlyBookingStatus,
  labelForDbStatus,
} from "@/lib/provider-booking-status-transitions";

export type ProviderBookingActionId =
  | "confirm"
  | "check_in"
  | "start_journey"
  | "mark_arrived"
  | "start_service"
  | "complete_service"
  | "cancel"
  | "mark_no_show"
  | "reset_to_confirmed";

export type ProviderBookingActionKind = "patch-status" | "post-action";

export interface ProviderBookingActionInput {
  id: string;
  status?: string | null;
  db_status?: string | null;
  payment_status?: string | null;
  scheduled_at?: string | null;
  location_type?: string | null;
  location_id?: string | null;
  address?: { line1?: string | null } | null;
  current_stage?: string | null;
  arrival_otp_verified?: boolean | null;
  qr_code_verified?: boolean | null;
  arrival_otp_pending?: boolean | null;
  qr_arrival_pending?: boolean | null;
}

export interface ProviderBookingAction {
  id: ProviderBookingActionId;
  label: string;
  dbTarget: string;
  kind: ProviderBookingActionKind;
  route?: string;
  payload?: Record<string, unknown>;
  destructive?: boolean;
  disabledReason?: string;
  listPrimary?: boolean;
}

export interface ProviderBookingActionModel {
  currentDbStatus: string;
  statusLabel: string;
  paymentLifecycleNote?: string;
  actions: ProviderBookingAction[];
  statusTargets: string[];
  disabledReasons: string[];
  primaryListAction: ProviderBookingAction | null;
}

function normalizeDbStatus(booking: ProviderBookingActionInput): string {
  const rawDb = booking.db_status?.trim().toLowerCase();
  if (rawDb) return rawDb;
  const s = booking.status?.trim().toLowerCase();
  if (s === "booked") return "confirmed";
  if (s === "started") return "in_progress";
  if (s === "pending_payment") return "pending_payment";
  if (s === "pending") return "pending";
  if (s === "completed") return "completed";
  if (s === "cancelled") return "cancelled";
  if (s === "no_show") return "no_show";
  if (s === "waiting") return "waiting";
  if (s === "checked_in") return "checked_in";
  if (s === "in_progress") return "in_progress";
  return "confirmed";
}

function isAtHomeBooking(booking: ProviderBookingActionInput): boolean {
  return (
    booking.location_type === "at_home" ||
    (booking.location_type == null && !booking.location_id && !!booking.address?.line1?.trim())
  );
}

function isToday(value: string | null | undefined): boolean {
  if (!value) return false;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return false;
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function actionForTarget(
  bookingId: string,
  dbTarget: string,
  options: { recovery?: boolean } = {},
): ProviderBookingAction {
  if (dbTarget === "in_progress") {
    return {
      id: "start_service",
      label: "Start service",
      dbTarget,
      kind: "post-action",
      route: `/api/provider/bookings/${bookingId}/start-service`,
    };
  }
  if (dbTarget === "completed") {
    return {
      id: "complete_service",
      label: "Complete service",
      dbTarget,
      kind: "post-action",
      route: `/api/provider/bookings/${bookingId}/complete-service`,
    };
  }
  if (dbTarget === "cancelled") {
    return {
      id: "cancel",
      label: "Cancel booking",
      dbTarget,
      kind: "patch-status",
      destructive: true,
      payload: { status: "cancelled" },
    };
  }
  if (dbTarget === "no_show") {
    return {
      id: "mark_no_show",
      label: "Mark no-show",
      dbTarget,
      kind: "patch-status",
      payload: { status: "no_show" },
    };
  }
  if (dbTarget === "checked_in") {
    return {
      id: "check_in",
      label: "Check in",
      dbTarget,
      kind: "patch-status",
      payload: { status: "checked_in" },
    };
  }
  if (dbTarget === "confirmed" && options.recovery) {
    return {
      id: "reset_to_confirmed",
      label: "Reset to confirmed",
      dbTarget,
      kind: "patch-status",
      payload: { status: dbTargetToPatchStatusField(dbTarget) },
    };
  }
  return {
    id: "confirm",
    label: "Confirm",
    dbTarget,
    kind: "patch-status",
    payload: { status: dbTargetToPatchStatusField(dbTarget) },
  };
}

/**
 * House-call journey actions (POST endpoints) that are surfaced as first-class
 * actions for at-home bookings. These do not change `bookings.status`; they
 * advance `current_stage` and emit booking events. Provider mobile + web should
 * prefer these for the at-home flow rather than the generic status picker.
 */
function buildHouseCallActions(
  booking: ProviderBookingActionInput,
  effectiveDbStatus: string,
): ProviderBookingAction[] {
  const actions: ProviderBookingAction[] = [];
  const stage = (booking.current_stage ?? "").trim();
  const arrivalVerified = booking.arrival_otp_verified === true || booking.qr_code_verified === true;

  const canStartJourney =
    (effectiveDbStatus === "confirmed") &&
    (stage === "" || stage === "confirmed");
  if (canStartJourney) {
    actions.push({
      id: "start_journey",
      label: "Start journey",
      dbTarget: "confirmed",
      kind: "post-action",
      route: `/api/provider/bookings/${booking.id}/start-journey`,
    });
  }

  const canMarkArrived = effectiveDbStatus === "confirmed" && stage === "provider_on_way";
  if (canMarkArrived) {
    actions.push({
      id: "mark_arrived",
      label: "Mark arrived",
      dbTarget: "confirmed",
      kind: "post-action",
      route: `/api/provider/bookings/${booking.id}/arrive`,
    });
  }

  // Once arrived + verified, "Start service" already comes from the status target
  // pipeline (in_progress). Don't double-add it here.
  void arrivalVerified;

  return actions;
}

export function buildProviderBookingActionModel(
  booking: ProviderBookingActionInput,
  options: { listContext?: boolean } = {},
): ProviderBookingActionModel {
  const currentDbStatus = normalizeDbStatus(booking);
  const atHome = isAtHomeBooking(booking);
  const paymentStatus = booking.payment_status?.trim().toLowerCase();
  const arrivalVerified = booking.arrival_otp_verified === true || booking.qr_code_verified === true;
  const arrivalOtpPending = booking.arrival_otp_pending === true;
  const qrArrivalPending = booking.qr_arrival_pending === true;

  // When a booking is stuck in pending_payment but payment has already been confirmed
  // by the gateway (payment_status = "paid" or "partially_paid"), treat it as "pending"
  // for all action decisions. The DB repair runs asynchronously via the API normalisation,
  // but the action model must be correct immediately so the provider can act without delay.
  const isPaymentConfirmed =
    paymentStatus === "paid" || paymentStatus === "partially_paid";
  const effectiveDbStatus =
    currentDbStatus === "pending_payment" && isPaymentConfirmed
      ? "pending"
      : currentDbStatus;

  const effectiveRawTargets = getAllowedTransitionTargets(effectiveDbStatus);
  const resolvedStatusTargets = filterStatusTargetsForBookingType({
    targets: effectiveRawTargets,
    atHome,
    arrivalVerified,
    arrivalOtpPending,
    qrArrivalPending,
    currentStage: booking.current_stage,
    currentDbStatus: effectiveDbStatus,
  });

  // Recovery: when an at-home booking is stuck in a salon-only state (legacy data
  // or a previous bug), the filter injects `confirmed` as a recovery target so
  // the provider can roll back and re-engage the journey flow.
  const isAtHomeRecovery = atHome && isSalonOnlyBookingStatus(effectiveDbStatus);

  const actions: ProviderBookingAction[] = resolvedStatusTargets.map((target) =>
    actionForTarget(booking.id, target, {
      recovery: isAtHomeRecovery && target === "confirmed",
    }),
  );

  // House-call journey actions (POST endpoints — not status PATCHes) live alongside
  // the status actions so consumers can present a single unified action list.
  if (atHome) {
    const journeyActions = buildHouseCallActions(booking, effectiveDbStatus);
    actions.push(...journeyActions);
  }
  const disabledReasons: string[] = [];
  let paymentLifecycleNote: string | undefined;

  if (
    (currentDbStatus === "pending" || currentDbStatus === "pending_payment") &&
    isPaymentConfirmed
  ) {
    paymentLifecycleNote = "Payment received. Please confirm this booking.";
  }
  if (currentDbStatus === "pending_payment" && !isPaymentConfirmed) {
    disabledReasons.push("Payment is still being verified. You can cancel, but confirmation is blocked until payment clears.");
  }
  if (atHome && effectiveRawTargets.includes("in_progress") && !resolvedStatusTargets.includes("in_progress")) {
    disabledReasons.push("Start service is locked until you mark arrival and complete PIN or QR verification.");
  }
  if (isAtHomeRecovery) {
    disabledReasons.push(
      `This house-call booking is in a salon-only status (${labelForDbStatus(effectiveDbStatus)}). Reset to confirmed to start the journey.`,
    );
  }
  if (actions.length === 0 && disabledReasons.length === 0) {
    disabledReasons.push(`${labelForDbStatus(currentDbStatus)} bookings have no further status actions.`);
  }

  const primaryListAction = (() => {
    const today = isToday(booking.scheduled_at);
    if (effectiveDbStatus === "pending") return actions.find((a) => a.id === "confirm") ?? null;
    if (effectiveDbStatus === "confirmed" && atHome) {
      const stage = (booking.current_stage ?? "").trim();
      if (stage === "provider_on_way") {
        return actions.find((a) => a.id === "mark_arrived") ?? null;
      }
      if (stage === "provider_arrived" && arrivalVerified) {
        return actions.find((a) => a.id === "start_service") ?? null;
      }
      if (today) {
        return (
          actions.find((a) => a.id === "start_journey") ??
          actions.find((a) => a.id === "mark_arrived") ??
          null
        );
      }
      return null;
    }
    if (effectiveDbStatus === "confirmed" && today && !atHome) return actions.find((a) => a.id === "check_in") ?? null;
    if (effectiveDbStatus === "waiting" && today) return actions.find((a) => a.id === "check_in") ?? null;
    if (effectiveDbStatus === "checked_in" && atHome) {
      return actions.find((a) => a.id === "reset_to_confirmed") ?? null;
    }
    if (effectiveDbStatus === "checked_in") return actions.find((a) => a.id === "start_service") ?? null;
    if (effectiveDbStatus === "in_progress") return actions.find((a) => a.id === "complete_service") ?? null;
    return null;
  })();

  if (primaryListAction && options.listContext) {
    primaryListAction.listPrimary = true;
  }

  return {
    currentDbStatus: effectiveDbStatus,
    statusLabel: labelForDbStatus(effectiveDbStatus),
    paymentLifecycleNote,
    actions,
    statusTargets: resolvedStatusTargets,
    disabledReasons,
    primaryListAction,
  };
}

export function mapProviderBookingActionError(error: string | null | undefined, code?: string | null): string {
  if (!error && !code) return "The booking could not be updated. Please refresh and try again.";
  const normalized = (error || "").trim().toLowerCase();
  if (normalized === "failed to update booking" || code === "INTERNAL_ERROR") {
    return "The booking could not be updated safely. Refresh the booking and try again; if it still fails, choose another slot or contact support.";
  }
  switch (code) {
    case "INVALID_STATUS_TRANSITION":
      return error || "That status change is not allowed from the booking's current state.";
    case "VERIFICATION_NOT_COMPLETE":
      return "Arrival must be verified by PIN or QR before starting this at-home service.";
    case "HOUSECALL_STAGE_REQUIRED":
      return error || "Complete the previous house-call step before starting service.";
    case "CONFLICT":
      return "This booking was updated elsewhere. Refresh and try again.";
    case "SLOT_NOT_AVAILABLE":
      return error || "That time is no longer available. Choose another slot.";
    case "VALIDATION_ERROR":
      return error || "Check the booking details and try again.";
    case "FORBIDDEN":
      return error || "You do not have permission to update this booking.";
    case "NOT_FOUND":
      return "This booking could not be found. Refresh your bookings list.";
    default:
      return error || "The booking could not be updated. Please refresh and try again.";
  }
}
