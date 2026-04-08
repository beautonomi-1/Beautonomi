export function customerFrequencyToRrule(frequency: "weekly" | "biweekly" | "monthly"): string {
  if (frequency === "weekly") return "FREQ=WEEKLY;INTERVAL=1";
  if (frequency === "biweekly") return "FREQ=WEEKLY;INTERVAL=2";
  return "FREQ=MONTHLY;INTERVAL=1";
}

export function preferredTimeToHhMmSs(preferred: string): string {
  const t = preferred.trim();
  if (/^\d{2}:\d{2}:\d{2}$/.test(t)) return t;
  if (/^\d{2}:\d{2}$/.test(t)) return `${t}:00`;
  return "10:00:00";
}

export const CUSTOMER_RECURRING_FREQUENCIES = ["weekly", "biweekly", "monthly"] as const;
export type CustomerRecurringFrequency = (typeof CUSTOMER_RECURRING_FREQUENCIES)[number];

export function parseSubscribeFrequencyFromPaystack(value: unknown): CustomerRecurringFrequency | null {
  if (value == null) return null;
  const s = typeof value === "string" ? value.trim() : String(value).trim();
  if (!s) return null;
  return (CUSTOMER_RECURRING_FREQUENCIES as readonly string[]).includes(s)
    ? (s as CustomerRecurringFrequency)
    : null;
}
