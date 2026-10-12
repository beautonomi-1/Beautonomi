/**
 * Canonical customer booking tracking steps (web + mobile).
 * Progress is derived from status, current_stage, and optional booking events — never from
 * "status !== pending" alone.
 */

export type CustomerTrackingStepKey =
  | "received"
  | "accepted"
  | "salonCheckedIn"
  | "enRoute"
  | "arrived"
  | "inProgress"
  | "completed"
  | "cancelled"
  | "no_show";

export type CustomerTrackingStepState = "done" | "current" | "upcoming";

export type CustomerTrackingStep = {
  key: CustomerTrackingStepKey;
  state: CustomerTrackingStepState;
  /** Terminal row (cancelled / no-show) — use danger/warning styling, not success green. */
  isTerminal?: boolean;
  terminalKind?: "cancelled" | "no_show";
};

export type BuildCustomerTrackingStepsInput = {
  status?: string | null;
  locationType?: string | null;
  currentStage?: string | null;
  arrivalOtpVerified?: boolean;
  hasConfirmedEvent?: boolean;
};

const POST_ACCEPT_STAGES = new Set([
  "confirmed",
  "client_arrived",
  "provider_on_way",
  "provider_arrived",
  "service_started",
  "service_completed",
]);

const SERVICE_PROGRESS_STATUSES = new Set(["in_progress", "started"]);
const SALON_CHECKIN_STATUSES = new Set(["waiting", "checked_in"]);

function normStatus(raw?: string | null): string {
  return String(raw ?? "pending").toLowerCase();
}

function normStage(raw?: string | null): string | null {
  const s = String(raw ?? "").trim().toLowerCase();
  return s || null;
}

function isAtHome(locationType?: string | null): boolean {
  return locationType === "at_home";
}

type ReachFlags = {
  received: boolean;
  accepted: boolean;
  salonCheckedIn: boolean;
  enRoute: boolean;
  arrived: boolean;
  inProgress: boolean;
  completed: boolean;
};

function computeReach(input: BuildCustomerTrackingStepsInput): ReachFlags {
  const status = normStatus(input.status);
  const stage = normStage(input.currentStage);
  const otpVerified = Boolean(input.arrivalOtpVerified);
  const hasConfirmedEvent = Boolean(input.hasConfirmedEvent);

  const acceptedByStatus = new Set([
    "confirmed",
    "waiting",
    "checked_in",
    ...SERVICE_PROGRESS_STATUSES,
    "completed",
  ]).has(status);

  const acceptedByStage = stage != null && POST_ACCEPT_STAGES.has(stage);
  const accepted = acceptedByStatus || acceptedByStage || hasConfirmedEvent;

  const salonCheckedIn =
    SALON_CHECKIN_STATUSES.has(status) ||
    stage === "client_arrived" ||
    stage === "service_started" ||
    stage === "service_completed" ||
    SERVICE_PROGRESS_STATUSES.has(status) ||
    status === "completed";

  const enRoute =
    stage === "provider_on_way" ||
    stage === "provider_arrived" ||
    stage === "service_started" ||
    stage === "service_completed" ||
    SERVICE_PROGRESS_STATUSES.has(status) ||
    status === "completed" ||
    otpVerified;

  const arrived =
    otpVerified ||
    stage === "provider_arrived" ||
    stage === "service_started" ||
    stage === "service_completed" ||
    SERVICE_PROGRESS_STATUSES.has(status) ||
    status === "completed";

  const inProgress =
    SERVICE_PROGRESS_STATUSES.has(status) ||
    stage === "service_started" ||
    stage === "service_completed" ||
    status === "completed";

  const completed = status === "completed" || stage === "service_completed";

  return {
    received: true,
    accepted,
    salonCheckedIn,
    enRoute,
    arrived,
    inProgress,
    completed,
  };
}

function salonPipeline(): CustomerTrackingStepKey[] {
  return ["received", "accepted", "salonCheckedIn", "inProgress", "completed"];
}

function atHomePipeline(): CustomerTrackingStepKey[] {
  return ["received", "accepted", "enRoute", "arrived", "inProgress", "completed"];
}

function isReached(key: CustomerTrackingStepKey, reach: ReachFlags): boolean {
  switch (key) {
    case "received":
      return reach.received;
    case "accepted":
      return reach.accepted;
    case "salonCheckedIn":
      return reach.salonCheckedIn;
    case "enRoute":
      return reach.enRoute;
    case "arrived":
      return reach.arrived;
    case "inProgress":
      return reach.inProgress;
    case "completed":
      return reach.completed;
    default:
      return false;
  }
}

function resolveCurrentKey(
  input: BuildCustomerTrackingStepsInput,
  reach: ReachFlags,
  pipeline: CustomerTrackingStepKey[],
): CustomerTrackingStepKey {
  const status = normStatus(input.status);
  const stage = normStage(input.currentStage);
  const atHome = isAtHome(input.locationType);

  if (status === "pending" || status === "pending_payment") {
    if (reach.accepted) {
      return "accepted";
    }
    return "received";
  }

  if (reach.completed) {
    return "completed";
  }

  if (reach.inProgress) {
    return "inProgress";
  }

  if (atHome) {
    if (stage === "provider_on_way") {
      return "enRoute";
    }
    if (stage === "provider_arrived" && !input.arrivalOtpVerified) {
      return "arrived";
    }
    if (stage === "provider_arrived" && input.arrivalOtpVerified) {
      return "arrived";
    }
  }

  if (!atHome && reach.salonCheckedIn && !reach.inProgress) {
    return "salonCheckedIn";
  }

  if (reach.accepted && !reach.inProgress && !reach.completed) {
    if (!atHome && status === "confirmed" && !reach.salonCheckedIn) {
      return "accepted";
    }
    if (atHome && (stage === "confirmed" || stage == null) && status === "confirmed") {
      return "accepted";
    }
    if (!atHome && (SALON_CHECKIN_STATUSES.has(status) || stage === "client_arrived")) {
      return "salonCheckedIn";
    }
  }

  if (reach.accepted) {
    return atHome ? (reach.enRoute ? "enRoute" : "accepted") : "accepted";
  }

  return pipeline[0] ?? "received";
}

function applyStates(
  pipeline: CustomerTrackingStepKey[],
  reach: ReachFlags,
  currentKey: CustomerTrackingStepKey,
): CustomerTrackingStep[] {
  let passedCurrent = false;
  return pipeline.map((key) => {
    const reached = isReached(key, reach);
    if (key === currentKey) {
      passedCurrent = true;
      return { key, state: "current" as const };
    }
    if (!passedCurrent && reached) {
      return { key, state: "done" as const };
    }
    if (passedCurrent) {
      return { key, state: "upcoming" as const };
    }
    if (reached) {
      return { key, state: "done" as const };
    }
    return { key, state: "upcoming" as const };
  });
}

/**
 * Build ordered tracking steps for customer UI.
 * Terminal bookings omit unreached future steps and append cancelled / no-show.
 */
export function buildCustomerTrackingSteps(
  input: BuildCustomerTrackingStepsInput,
): CustomerTrackingStep[] {
  const status = normStatus(input.status);
  const pipeline = isAtHome(input.locationType) ? atHomePipeline() : salonPipeline();
  const reach = computeReach(input);

  if (status === "cancelled" || status === "no_show") {
    const terminalKind = status === "no_show" ? "no_show" : "cancelled";
    const terminalKey: CustomerTrackingStepKey = terminalKind;

    const visible = pipeline.filter((key) => isReached(key, reach));
    const steps: CustomerTrackingStep[] = visible.map((key) => ({
      key,
      state: "done",
    }));

    steps.push({
      key: terminalKey,
      state: "done",
      isTerminal: true,
      terminalKind,
    });

    return steps;
  }

  const currentKey = resolveCurrentKey(input, reach, pipeline);
  return applyStates(pipeline, reach, currentKey);
}

/** Live journey UI (ETA, map, PIN, QR) — off when the booking is terminal or service is finished. */
export function isBookingJourneyLive(input: BuildCustomerTrackingStepsInput): boolean {
  const status = normStatus(input.status);
  if (status === "completed" || status === "cancelled" || status === "no_show") {
    return false;
  }
  return true;
}

/** Whether arrival PIN/QR should be offered (at-home, arrived stage, journey still live). */
export function isBookingArrivalVerificationActive(input: BuildCustomerTrackingStepsInput): boolean {
  if (!isAtHome(input.locationType)) return false;
  if (!isBookingJourneyLive(input)) return false;

  const stage = normStage(input.currentStage);
  if (stage !== "provider_arrived") return false;
  if (input.arrivalOtpVerified) return false;

  return true;
}

/** English labels for web (mobile uses i18n keys in the app). */
export const CUSTOMER_TRACKING_STEP_WEB_LABELS: Record<CustomerTrackingStepKey, string> = {
  received: "Request received",
  accepted: "Booking Accepted",
  salonCheckedIn: "Checked in",
  enRoute: "Provider on the way",
  arrived: "Provider arrived",
  inProgress: "Service in-progress",
  completed: "Service Complete",
  cancelled: "Booking cancelled",
  no_show: "Marked as no-show",
};
