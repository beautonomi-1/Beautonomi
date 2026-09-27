/** How long evidence stays current for each control cadence, including a grace period. */
export const GRC_CADENCE_DAYS: Record<string, number> = {
  continuous: 7,
  monthly: 35,
  quarterly: 100,
  semiannual: 190,
  annual: 380,
};

const DAY = 86_400_000;

export function evidenceIsCurrent(frequency: string | null | undefined, lastEvidenceAt: string | null | undefined, now = Date.now()): boolean {
  if (!lastEvidenceAt) return false;
  const days = GRC_CADENCE_DAYS[frequency ?? "annual"] ?? GRC_CADENCE_DAYS.annual;
  return now - new Date(lastEvidenceAt).getTime() <= days * DAY;
}

/** Evidence is due when it will go stale within `leadDays`. */
export function evidenceDueAt(frequency: string | null | undefined, lastEvidenceAt: string | null | undefined, now = Date.now()): Date {
  const days = GRC_CADENCE_DAYS[frequency ?? "annual"] ?? GRC_CADENCE_DAYS.annual;
  if (!lastEvidenceAt) return new Date(now);
  return new Date(new Date(lastEvidenceAt).getTime() + days * DAY);
}
