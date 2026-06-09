/** Shared live-tracking labels for provider + customer booking detail surfaces. */

export function formatBookingLiveStageLabel(stage: string | null | undefined): string | null {
  switch (stage) {
    case "provider_on_way":
      return "Provider on the way";
    case "provider_arrived":
      return "Provider has arrived";
    case "arrival_verified":
      return "Arrival verified";
    case "in_service":
    case "service_in_progress":
      return "Service in progress";
    case "completed":
      return "Completed";
    default:
      return null;
  }
}

export function formatBookingEtaLabel(estimatedArrival: string | null | undefined): string | null {
  if (!estimatedArrival) return null;
  const eta = new Date(estimatedArrival);
  if (!Number.isFinite(eta.getTime())) return null;
  const mins = Math.max(0, Math.round((eta.getTime() - Date.now()) / 60000));
  if (mins <= 0) return "Arriving now";
  if (mins === 1) return "ETA ~1 min";
  return `ETA ~${mins} min`;
}
