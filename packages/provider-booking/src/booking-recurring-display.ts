export type RecurringDisplayDetails = {
  seriesId: string | null;
  label: string;
  startDate: string | null;
  endDate: string | null;
  lastBookingDate: string | null;
  occurrences: number | null;
  status: string | null;
};

function recurrencePatternLabel(rule: unknown, fallbackFrequency?: unknown): string {
  if (typeof rule === "string" && rule.trim()) return rule.trim();
  if (rule && typeof rule === "object") {
    const r = rule as Record<string, unknown>;
    const pattern = String(r.pattern ?? r.frequency ?? "").toLowerCase();
    if (pattern === "daily") return "Daily";
    if (pattern === "weekly") return "Weekly";
    if (pattern === "biweekly") return "Every 2 weeks";
    if (pattern === "monthly") return "Monthly";
  }
  const fb = String(fallbackFrequency ?? "").toLowerCase();
  if (fb) return fb.charAt(0).toUpperCase() + fb.slice(1);
  return "Recurring";
}

/** Shared recurring series banner data for view sheets and detail pages. */
export function getBookingRecurringDisplayDetails(
  appointment: Record<string, unknown> | null | undefined,
): RecurringDisplayDetails | null {
  if (!appointment) return null;
  const series =
    appointment.recurring_series && typeof appointment.recurring_series === "object"
      ? (appointment.recurring_series as Record<string, unknown>)
      : {};
  const seriesId = (appointment.recurring_series_id ?? series.id) as string | null | undefined;
  if (!appointment.is_recurring && !seriesId) return null;

  const rule = appointment.recurrence_rule ?? series.recurrence_rule;
  const startDate = (appointment.recurrence_start_date ?? series.start_date) as string | null;
  const endDate = (appointment.recurrence_end_date ?? series.end_date) as string | null;
  const lastBookingDate = (appointment.recurrence_last_booking_date ?? series.last_booking_date) as
    | string
    | null;
  const occurrences = (appointment.recurrence_occurrences ?? series.occurrences) as number | null;

  return {
    seriesId: seriesId ? String(seriesId) : null,
    label: recurrencePatternLabel(rule, appointment.recurrence_frequency ?? series.frequency),
    startDate: startDate ? String(startDate) : null,
    endDate: endDate ? String(endDate) : null,
    lastBookingDate: lastBookingDate ? String(lastBookingDate) : null,
    occurrences: occurrences != null ? Number(occurrences) : null,
    status: (series.status as string | null) ?? null,
  };
}
