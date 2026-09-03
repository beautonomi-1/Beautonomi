/**
 * Shared copy for customer-facing ETA during at-home "provider on the way" tracking.
 * Avoids misleading "~1 min" when the stored ETA is stale or already passed.
 */
export function getCustomerEtaUiParts(estimatedArrivalIso: string | null | undefined): {
  show: boolean;
  timeLabel: string | null;
  minutesLabel: string;
  isLate: boolean;
} {
  if (!estimatedArrivalIso || typeof estimatedArrivalIso !== "string") {
    return { show: false, timeLabel: null, minutesLabel: "", isLate: false };
  }
  const d = new Date(estimatedArrivalIso);
  if (!Number.isFinite(d.getTime())) {
    return { show: false, timeLabel: null, minutesLabel: "", isLate: false };
  }
  const ms = d.getTime() - Date.now();
  const minutes = Math.ceil(ms / 60000);
  const timeLabel = d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  if (ms < 0) {
    return { show: true, timeLabel, minutesLabel: "Running a little late", isLate: true };
  }
  if (minutes <= 1) {
    return { show: true, timeLabel, minutesLabel: "Arriving soon", isLate: false };
  }
  return { show: true, timeLabel, minutesLabel: `~${minutes} min`, isLate: false };
}
