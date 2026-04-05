/**
 * Subscription gating: "advanced" = BY* rules, COUNT, or UNTIL in RRULE.
 * INTERVAL alone (e.g. FREQ=WEEKLY;INTERVAL=2) stays on Starter — it is not advanced.
 */
export function isAdvancedRecurrenceRule(recurrenceRule: string): boolean {
  const u = recurrenceRule.toUpperCase();
  const advancedTokens = [
    "BYDAY=",
    "BYMONTHDAY=",
    "BYSETPOS=",
    "BYMONTH=",
    "BYYEARDAY=",
    "BYWEEKNO=",
    "BYHOUR=",
    "BYMINUTE=",
    "COUNT=",
    "UNTIL=",
  ];
  return advancedTokens.some((t) => u.includes(t));
}
