import { formatInTimeZone } from "date-fns-tz";
import {
  resolvePendingExpireDecision,
  type LifecycleProviderSettings,
  type PendingExpireDefaults,
  type WorkingHoursJson,
} from "./lifecycle-pending-expire";

export function slaSettingsFromHours(input?: {
  confirmation_sla_hours?: number | null;
  unconfirmed_expire_hours_before_slot?: number | null;
} | null): Pick<LifecycleProviderSettings, "confirmationSlaHours" | "unconfirmedExpireHoursBeforeSlot"> {
  const sla = Number(input?.confirmation_sla_hours);
  const pre = Number(input?.unconfirmed_expire_hours_before_slot);
  return {
    confirmationSlaHours: Number.isFinite(sla) && sla > 0 ? sla : undefined,
    unconfirmedExpireHoursBeforeSlot: Number.isFinite(pre) && pre > 0 ? pre : undefined,
  };
}

function formatClock(date: Date, timezone: string): string {
  return formatInTimeZone(date, timezone, "h:mm a");
}

export function pendingConfirmationSlaDisplay(input: {
  scheduledAt?: string | null;
  createdAt?: string | null;
  paymentStatus?: string | null;
  now?: Date;
  workingHours?: WorkingHoursJson | null;
  timezone?: string | null;
  settings?: LifecycleProviderSettings;
  defaults?: PendingExpireDefaults;
}): { lastMinute: boolean; overnight: boolean; timeLabel: string; body: string } {
  const now = input.now ?? new Date();
  const created = input.createdAt ?? now.toISOString();
  const scheduled = input.scheduledAt ?? created;
  const decision = resolvePendingExpireDecision(
    {
      createdAt: created,
      scheduledAt: scheduled,
      workingHours: input.workingHours,
      timezone: input.timezone,
      settings: input.settings,
    },
    input.defaults,
  );

  const createdAt = new Date(created);
  const scheduledAt = new Date(scheduled);
  const bookedLastMinute =
    Number.isFinite(scheduledAt.getTime()) &&
    Number.isFinite(createdAt.getTime()) &&
    scheduledAt.getTime() - createdAt.getTime() < 2 * 60 * 60 * 1000;

  const timeLabel = Number.isFinite(decision.displayConfirmAt.getTime())
    ? formatClock(decision.displayConfirmAt, decision.timezone)
    : "soon";

  const paid = String(input.paymentStatus ?? "").toLowerCase();
  const refundLine =
    paid === "paid" || paid === "partially_paid" || paid === "refunded"
      ? "refunded in full"
      : "not charged";

  if (bookedLastMinute || decision.lastMinute) {
    return {
      lastMinute: true,
      overnight: false,
      timeLabel,
      body: `This is a last-minute request — the salon has until ${timeLabel} to confirm.`,
    };
  }

  if (decision.overnightOpenAt) {
    const openTime = formatClock(decision.overnightOpenAt, decision.timezone);
    return {
      lastMinute: false,
      overnight: true,
      timeLabel,
      body: `The salon opens at ${openTime} and will confirm by ${timeLabel}. If not, this time is released and you're ${refundLine}.`,
    };
  }

  return {
    lastMinute: false,
    overnight: false,
    timeLabel,
    body: `The salon will confirm by ${timeLabel}. If not, this time is released and you're ${refundLine}.`,
  };
}
