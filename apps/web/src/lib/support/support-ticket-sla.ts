/** Resolution SLA window in hours by priority (aligned with migration 445 backfill). */
export function resolutionSlaHoursForPriority(priority: string | null | undefined): number {
  switch (priority) {
    case "urgent":
      return 4;
    case "high":
      return 24;
    case "medium":
      return 72;
    case "low":
      return 168;
    default:
      return 72;
  }
}

export function computeSlaResolutionDueIso(createdAtIso: string, priority: string | null | undefined): string {
  const created = new Date(createdAtIso);
  const hours = resolutionSlaHoursForPriority(priority);
  created.setTime(created.getTime() + hours * 3600_000);
  return created.toISOString();
}

/**
 * First-response SLA window in hours by priority (migration 726).
 * These are intentionally tight — the goal is to guarantee a human acknowledgement,
 * not full resolution.
 *   urgent  → 0.5 h  (30 minutes)
 *   high    → 2 h
 *   medium  → 8 h
 *   low     → 24 h
 */
export function firstResponseSlaHoursForPriority(priority: string | null | undefined): number {
  switch (priority) {
    case "urgent":
      return 0.5;
    case "high":
      return 2;
    case "medium":
      return 8;
    case "low":
      return 24;
    default:
      return 8;
  }
}

export function computeFirstResponseDueIso(createdAtIso: string, priority: string | null | undefined): string {
  const created = new Date(createdAtIso);
  const hours = firstResponseSlaHoursForPriority(priority);
  created.setTime(created.getTime() + hours * 3600_000);
  return created.toISOString();
}
