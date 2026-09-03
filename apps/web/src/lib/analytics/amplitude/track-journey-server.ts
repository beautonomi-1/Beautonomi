import { trackServer } from "./server";
import {
  EVENT_PROVIDER_ARRIVED,
  EVENT_PROVIDER_ETA_UPDATED,
  EVENT_PROVIDER_JOURNEY_STARTED,
} from "./types";

/**
 * At-home journey events (B3). Fire-and-forget from the journey routes; ids only.
 * insert_id = `${bookingId}:${event}[:${etaIso}]` so a double-tap never double counts.
 */
export function trackProviderJourneyStartedServer(params: {
  bookingId: string;
  userId?: string | null;
  etaMinutes?: number | null;
  etaSource?: "manual" | "gps" | null;
}): void {
  void trackServer(
    EVENT_PROVIDER_JOURNEY_STARTED,
    {
      portal: "provider",
      booking_id: params.bookingId,
      eta_minutes: params.etaMinutes ?? null,
      eta_source: params.etaSource ?? null,
    },
    params.userId ?? undefined,
    { insertId: `${params.bookingId}:${EVENT_PROVIDER_JOURNEY_STARTED}` },
  ).catch(() => undefined);
}

export function trackProviderEtaUpdatedServer(params: {
  bookingId: string;
  userId?: string | null;
  etaMinutes: number;
  previousEtaMinutes?: number | null;
  runningLate: boolean;
  estimatedArrivalIso: string;
}): void {
  void trackServer(
    EVENT_PROVIDER_ETA_UPDATED,
    {
      portal: "provider",
      booking_id: params.bookingId,
      eta_minutes: params.etaMinutes,
      previous_eta_minutes: params.previousEtaMinutes ?? null,
      running_late: params.runningLate,
    },
    params.userId ?? undefined,
    { insertId: `${params.bookingId}:${EVENT_PROVIDER_ETA_UPDATED}:${params.estimatedArrivalIso}` },
  ).catch(() => undefined);
}

export function trackProviderArrivedServer(params: { bookingId: string; userId?: string | null }): void {
  void trackServer(
    EVENT_PROVIDER_ARRIVED,
    { portal: "provider", booking_id: params.bookingId },
    params.userId ?? undefined,
    { insertId: `${params.bookingId}:${EVENT_PROVIDER_ARRIVED}` },
  ).catch(() => undefined);
}
