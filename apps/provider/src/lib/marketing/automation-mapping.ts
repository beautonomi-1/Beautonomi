/**
 * Maps marketing_automations rows to UI categories — kept in sync with
 * apps/web/src/app/provider/marketing/automations/page.tsx
 */

export type AutomationCategory = "reminder" | "update" | "booking" | "milestone";

export function mapTriggerToCategory(triggerType: string): AutomationCategory {
  if (!triggerType) return "reminder";
  const type = triggerType.toLowerCase();
  if (type.includes("reminder") || type.includes("before")) return "reminder";
  if (
    type.includes("update") ||
    type.includes("confirmed") ||
    type.includes("cancelled") ||
    type.includes("rescheduled") ||
    type.includes("no_show")
  ) {
    return "update";
  }
  if (
    type.includes("booking") ||
    type.includes("completed") ||
    type.includes("inactive") ||
    type.includes("lead") ||
    type.includes("package_expiring") ||
    type.includes("seasonal")
  ) {
    return "booking";
  }
  if (
    type.includes("birthday") ||
    type.includes("anniversary") ||
    type.includes("milestone") ||
    type.includes("visit_milestone") ||
    type.includes("referral") ||
    type.includes("holiday")
  ) {
    return "milestone";
  }
  return "reminder";
}

export function formatTriggerLabel(
  triggerType: string,
  triggerConfig: Record<string, unknown> | null | undefined,
): string {
  const cfg = triggerConfig ?? {};
  const hoursBefore = cfg.hours_before;
  if (typeof hoursBefore === "number") {
    return `${hoursBefore}h before`;
  }
  const minutesBefore = cfg.minutes_before;
  if (typeof minutesBefore === "number") {
    const hours = Math.floor(minutesBefore / 60);
    const minutes = minutesBefore % 60;
    if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m before`;
    if (hours > 0) return `${hours}h before`;
    return `${minutes}m before`;
  }
  return triggerType || "";
}

export const AUTOMATION_TAB_KEYS = ["reminders", "updates", "bookings", "milestones"] as const;
export type AutomationTabKey = (typeof AUTOMATION_TAB_KEYS)[number];

export function categoryToTabKey(category: AutomationCategory): AutomationTabKey {
  switch (category) {
    case "reminder":
      return "reminders";
    case "update":
      return "updates";
    case "booking":
      return "bookings";
    case "milestone":
      return "milestones";
    default:
      return "reminders";
  }
}
