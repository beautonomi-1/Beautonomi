import {
  getAllowedProviderBookingStatusTargets,
  isSalonOnlyBookingStatus,
} from "@/lib/bookings/booking-status-transitions";

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

export type ProviderBookingAction = {
  id: ProviderBookingActionId;
  label: string;
  dbTarget: string;
  destructive?: boolean;
};

export type ProviderBookingActionModel = {
  currentDbStatus: string;
  statusLabel: string;
  actions: ProviderBookingAction[];
  disabledReasons: string[];
  primaryAction: ProviderBookingAction | null;
  stepTitle: string;
  stepDescription: string;
  happyPath: string[];
  activeStepIndex: number;
};

type BookingActionInput = {
  id: string;
  status?: string | null;
  db_status?: string | null;
  payment_status?: string | null;
  scheduled_at?: string | null;
  location_type?: string | null;
  location_id?: string | null;
  current_stage?: string | null;
  arrival_otp_verified?: boolean | null;
  qr_code_verified?: boolean | null;
  arrival_otp_pending?: boolean | null;
  qr_arrival_pending?: boolean | null;
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  pending_payment: "Pending payment",
  confirmed: "Confirmed",
  checked_in: "Checked in",
  waiting: "Waiting",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
};

function normalizeDbStatus(booking: BookingActionInput): string {
  const db = booking.db_status?.trim().toLowerCase();
  if (db) return db;
  const status = booking.status?.trim().toLowerCase();
  if (status === "booked") return "confirmed";
  if (status === "started") return "in_progress";
  return status || "confirmed";
}

function actionForTarget(target: string, recovery = false): ProviderBookingAction {
  if (target === "confirmed" && recovery) {
    return { id: "reset_to_confirmed", label: "Reset to confirmed", dbTarget: target };
  }
  if (target === "confirmed") return { id: "confirm", label: "Confirm booking", dbTarget: target };
  if (target === "checked_in") return { id: "check_in", label: "Check in customer", dbTarget: target };
  if (target === "in_progress") return { id: "start_service", label: "Start service", dbTarget: target };
  if (target === "completed") return { id: "complete_service", label: "Complete service", dbTarget: target };
  if (target === "cancelled") return { id: "cancel", label: "Cancel booking", dbTarget: target, destructive: true };
  if (target === "no_show") return { id: "mark_no_show", label: "Mark no-show", dbTarget: target };
  return { id: "confirm", label: STATUS_LABELS[target] || target, dbTarget: target };
}

function isToday(value: string | null | undefined): boolean {
  if (!value) return false;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return false;
  const now = new Date();
  return date.toDateString() === now.toDateString();
}

export function buildProviderBookingActionModel(booking: BookingActionInput): ProviderBookingActionModel {
  const currentDbStatus = normalizeDbStatus(booking);
  const atHome = booking.location_type === "at_home";
  const paymentStatus = booking.payment_status?.trim().toLowerCase();
  const paymentConfirmed = paymentStatus === "paid" || paymentStatus === "partially_paid";
  const effectiveDbStatus =
    currentDbStatus === "pending_payment" && paymentConfirmed ? "pending" : currentDbStatus;
  const arrivalVerified = booking.arrival_otp_verified === true || booking.qr_code_verified === true;
  const arrivalPending = booking.arrival_otp_pending === true || booking.qr_arrival_pending === true;
  const stage = booking.current_stage?.trim() || "";

  let targets = getAllowedProviderBookingStatusTargets(effectiveDbStatus);
  const recovery = atHome && isSalonOnlyBookingStatus(effectiveDbStatus);
  if (recovery) {
    targets = ["confirmed"];
  } else if (atHome) {
    targets = targets.filter((target) => !isSalonOnlyBookingStatus(target));
    if (targets.includes("in_progress") && !(stage === "provider_arrived" && (arrivalVerified || !arrivalPending))) {
      targets = targets.filter((target) => target !== "in_progress");
    }
  }

  const actions = targets.map((target) => actionForTarget(target, recovery && target === "confirmed"));

  if (atHome && effectiveDbStatus === "confirmed" && (stage === "" || stage === "confirmed")) {
    actions.push({ id: "start_journey", label: "Start journey", dbTarget: "confirmed" });
  }
  if (atHome && effectiveDbStatus === "confirmed" && stage === "provider_on_way") {
    actions.push({ id: "mark_arrived", label: "Mark arrived", dbTarget: "confirmed" });
  }

  const disabledReasons: string[] = [];
  if (currentDbStatus === "pending_payment" && !paymentConfirmed) {
    disabledReasons.push("Payment is still being verified. Confirmation and service actions unlock after payment clears.");
  }
  if (atHome && effectiveDbStatus === "confirmed" && stage === "provider_arrived" && arrivalPending && !arrivalVerified) {
    disabledReasons.push("Start service is locked until PIN or QR arrival verification is complete.");
  }
  if (recovery) {
    disabledReasons.push("This house-call booking is in a salon-only status. Reset to confirmed to restart the journey flow.");
  }
  if (actions.length === 0 && disabledReasons.length === 0) {
    disabledReasons.push(`${STATUS_LABELS[currentDbStatus] || currentDbStatus} bookings have no further status actions.`);
  }

  const primaryAction =
    actions.find((action) => action.id === "confirm") ||
    (atHome && effectiveDbStatus === "confirmed" && stage === "provider_on_way"
      ? actions.find((action) => action.id === "mark_arrived")
      : null) ||
    (atHome && effectiveDbStatus === "confirmed" && (stage === "" || stage === "confirmed") && isToday(booking.scheduled_at)
      ? actions.find((action) => action.id === "start_journey")
      : null) ||
    actions.find((action) => action.id === "check_in") ||
    actions.find((action) => action.id === "start_service") ||
    actions.find((action) => action.id === "complete_service") ||
    null;

  const happyPath = atHome
    ? ["Confirm", "Start journey", "Arrived", "Verify", "Start", "Complete"]
    : ["Confirm", "Check in", "Start", "Complete"];
  const activeStepIndex = (() => {
    if (effectiveDbStatus === "completed") return happyPath.length - 1;
    if (effectiveDbStatus === "in_progress") return happyPath.length - 2;
    if (atHome) {
      if (stage === "provider_arrived" && arrivalVerified) return 4;
      if (stage === "provider_arrived") return 3;
      if (stage === "provider_on_way") return 2;
      if (effectiveDbStatus === "confirmed") return 1;
      return 0;
    }
    if (effectiveDbStatus === "checked_in" || effectiveDbStatus === "waiting") return 1;
    if (effectiveDbStatus === "confirmed") return 0;
    return 0;
  })();

  const stepTitle = primaryAction ? primaryAction.label : STATUS_LABELS[currentDbStatus] || "Manage booking";
  const stepDescription = atHome
    ? "House-call bookings should progress through the journey actions first, then start and complete the service."
    : "Salon and walk-in bookings should follow the check-in, start service, and complete sequence.";

  return {
    currentDbStatus,
    statusLabel: STATUS_LABELS[currentDbStatus] || currentDbStatus,
    actions,
    disabledReasons,
    primaryAction,
    stepTitle,
    stepDescription,
    happyPath,
    activeStepIndex,
  };
}
