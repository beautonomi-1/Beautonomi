import {
  dbTargetToPatchStatusField,
  filterInProgressWhenAtHomeVerificationPending,
  getAllowedTransitionTargets,
  labelForDbStatus,
} from "@/lib/provider-booking-status-transitions";

export type ProviderBookingActionId =
  | "confirm"
  | "check_in"
  | "start_service"
  | "complete_service"
  | "cancel"
  | "mark_no_show";

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

function actionForTarget(bookingId: string, dbTarget: string): ProviderBookingAction {
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
  return {
    id: "confirm",
    label: "Confirm",
    dbTarget,
    kind: "patch-status",
    payload: { status: dbTargetToPatchStatusField(dbTarget) },
  };
}

export function buildProviderBookingActionModel(
  booking: ProviderBookingActionInput,
  options: { listContext?: boolean } = {},
): ProviderBookingActionModel {
  const currentDbStatus = normalizeDbStatus(booking);
  const atHome = isAtHomeBooking(booking);
  const paymentStatus = booking.payment_status?.trim().toLowerCase();
  const rawTargets = getAllowedTransitionTargets(currentDbStatus);
  const statusTargets = filterInProgressWhenAtHomeVerificationPending({
    targets: rawTargets,
    atHome,
    arrivalVerified: booking.arrival_otp_verified === true || booking.qr_code_verified === true,
    arrivalOtpPending: booking.arrival_otp_pending === true,
    qrArrivalPending: booking.qr_arrival_pending === true,
    currentStage: booking.current_stage,
  });

  const actions = statusTargets.map((target) => actionForTarget(booking.id, target));
  const disabledReasons: string[] = [];
  let paymentLifecycleNote: string | undefined;

  if (currentDbStatus === "pending" && paymentStatus === "paid") {
    paymentLifecycleNote = "Payment is settled, but the appointment still needs provider confirmation.";
  }
  if (currentDbStatus === "pending_payment") {
    disabledReasons.push("Payment is still being verified. You can cancel, but confirmation is blocked until payment clears.");
  }
  if (atHome && rawTargets.includes("in_progress") && !statusTargets.includes("in_progress")) {
    disabledReasons.push("Start service is locked until you mark arrival and complete PIN or QR verification.");
  }
  if (actions.length === 0 && disabledReasons.length === 0) {
    disabledReasons.push(`${labelForDbStatus(currentDbStatus)} bookings have no further status actions.`);
  }

  const primaryListAction = (() => {
    const today = isToday(booking.scheduled_at);
    if (currentDbStatus === "pending") return actions.find((a) => a.dbTarget === "confirmed") ?? null;
    if (currentDbStatus === "confirmed" && today && !atHome) return actions.find((a) => a.dbTarget === "checked_in") ?? null;
    if (currentDbStatus === "waiting" && today) return actions.find((a) => a.dbTarget === "checked_in") ?? null;
    if (currentDbStatus === "checked_in") return actions.find((a) => a.dbTarget === "in_progress") ?? null;
    if (currentDbStatus === "in_progress") return actions.find((a) => a.dbTarget === "completed") ?? null;
    return null;
  })();

  if (primaryListAction && options.listContext) {
    primaryListAction.listPrimary = true;
  }

  return {
    currentDbStatus,
    statusLabel: labelForDbStatus(currentDbStatus),
    paymentLifecycleNote,
    actions,
    statusTargets,
    disabledReasons,
    primaryListAction,
  };
}

export function mapProviderBookingActionError(error: string | null | undefined, code?: string | null): string {
  if (!error && !code) return "The booking could not be updated. Please refresh and try again.";
  switch (code) {
    case "INVALID_STATUS_TRANSITION":
      return error || "That status change is not allowed from the booking's current state.";
    case "VERIFICATION_NOT_COMPLETE":
      return "Arrival must be verified by PIN or QR before starting this at-home service.";
    case "HOUSECALL_STAGE_REQUIRED":
      return error || "Complete the previous house-call step before starting service.";
    case "CONFLICT":
      return "This booking was updated elsewhere. Refresh and try again.";
    case "FORBIDDEN":
      return error || "You do not have permission to update this booking.";
    case "NOT_FOUND":
      return "This booking could not be found. Refresh your bookings list.";
    default:
      return error || "The booking could not be updated. Please refresh and try again.";
  }
}
