/** Whether close-out bulk complete should only call complete-service (no start-service). */
export function isAlreadyStartedForCompletion(booking: {
  status?: string | null;
  current_stage?: string | null;
}): boolean {
  const status = String(booking.status ?? "");
  const stage = String(booking.current_stage ?? "");
  return status === "in_progress" || stage === "service_started";
}

/** At-home confirmed without journey progress cannot be bulk-completed. */
export function isAtHomeCloseOutBlocked(booking: {
  location_type?: string | null;
  status?: string | null;
  current_stage?: string | null;
}): boolean {
  if (booking.location_type !== "at_home") return false;
  const status = String(booking.status ?? "");
  const stage = (booking.current_stage ?? "").trim();
  return status === "confirmed" && (stage === "" || stage === "confirmed");
}