import type { ReadonlyURLSearchParams } from "next/navigation";
import type { BookingState } from "./booking-flow";
import { coerceSelectedDate } from "@beautonomi/utils";

export const BOOKING_STATE_STORAGE_KEY = "booking_state";

/** Stable fingerprint for “same booking entry” from the URL (slug, primary service, mode). */
export function computeBookingFlowKey(
  searchParams: ReadonlyURLSearchParams | URLSearchParams
): string {
  const slug = (searchParams.get("slug") || searchParams.get("partnerId") || "").trim();
  const serviceId = (searchParams.get("serviceId") || searchParams.get("service") || "").trim();
  const mode = (searchParams.get("mode") || "").trim();
  return `${slug}|${serviceId}|${mode}`;
}

export type PersistedBookingEnvelope = {
  state: BookingState;
  timestamp: number;
  flowKey?: string;
  stepIndex?: number;
};

const MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

function stripDeprecatedFromState(state: BookingState): BookingState {
  const { currentStepIndex: _ignored, ...rest } = state;
  return {
    ...rest,
    selectedDate: coerceSelectedDate(state.selectedDate),
  };
}

export function parsePersistedBookingEnvelope(raw: string | null): PersistedBookingEnvelope | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PersistedBookingEnvelope & { state?: BookingState };
    if (!parsed?.state || typeof parsed.timestamp !== "number") return null;
    if (Date.now() - parsed.timestamp > MAX_AGE_MS) return null;
    return {
      state: stripDeprecatedFromState(parsed.state),
      timestamp: parsed.timestamp,
      flowKey: typeof parsed.flowKey === "string" ? parsed.flowKey : undefined,
      stepIndex: typeof parsed.stepIndex === "number" ? parsed.stepIndex : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Returns restored booking state + step when storage matches the current URL flow and age.
 */
export function restoreBookingFlowFromStorage(
  searchParams: ReadonlyURLSearchParams | URLSearchParams,
  urlFlowKey: string
): { state: BookingState; stepIndex: number } | null {
  if (typeof window === "undefined") return null;
  const env = parsePersistedBookingEnvelope(localStorage.getItem(BOOKING_STATE_STORAGE_KEY));
  if (!env) return null;

  if (env.flowKey != null && env.flowKey !== urlFlowKey) {
    return null;
  }

  // Legacy rows without flowKey: avoid restoring a different service than ?serviceId=
  if (env.flowKey == null) {
    const urlServiceId = (searchParams.get("serviceId") || searchParams.get("service"))?.trim();
    if (urlServiceId && env.state.selectedServices.length > 0) {
      const ids = new Set(env.state.selectedServices.map((s) => s.id));
      if (!ids.has(urlServiceId)) {
        return null;
      }
    }
  }

  const stepIndex =
    typeof env.stepIndex === "number" && env.stepIndex >= 0 && env.stepIndex <= 7
      ? env.stepIndex
      : 0;

  return { state: env.state, stepIndex };
}

export function clearBookingFlowStorage(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(BOOKING_STATE_STORAGE_KEY);
    localStorage.removeItem("booking_redirect_state");
  } catch {
    // ignore
  }
}

export function shouldForceFreshStartFromUrl(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).get("reset") === "1";
  } catch {
    return false;
  }
}
