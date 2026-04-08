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
