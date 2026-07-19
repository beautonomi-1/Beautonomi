/**
 * Formatting utilities for currency, dates, durations, etc.
 */
import { format, formatDistanceToNow, isToday, isTomorrow, isYesterday, isValid, parseISO } from "date-fns";
import { formatMoney, formatMoneyCompact, normalizeCurrencyCode } from "@beautonomi/utils";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";

function parseIsoSafe(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const parsed = parseISO(dateStr);
  return isValid(parsed) ? parsed : null;
}

export function formatCurrency(
  amount: number,
  currency = getTenantDefaultCurrency(),
  locale?: string,
): string {
  const code = normalizeCurrencyCode(currency);
  const resolvedLocale = locale ?? Intl.DateTimeFormat().resolvedOptions().locale ?? "en-ZA";
  return formatMoney(amount, code, resolvedLocale);
}

export function formatCurrencyShort(amount: number, currency = getTenantDefaultCurrency()): string {
  return formatMoneyCompact(amount, currency);
}

export function formatDate(dateStr: string | null | undefined, fmt = "MMM d, yyyy"): string {
  if (!dateStr) return "";
  try {
    const parsed = parseIsoSafe(dateStr);
    return parsed ? format(parsed, fmt) : dateStr;
  } catch {
    return dateStr;
  }
}

export function formatTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  try {
    const parsed = parseIsoSafe(dateStr);
    return parsed ? format(parsed, "HH:mm") : dateStr;
  } catch {
    return dateStr;
  }
}

/**
 * §Provider-audit 2026-04: format an instant as `HH:mm` in an explicit IANA
 * timezone (e.g. the provider's business zone). Falls back to device-local
 * formatting when no `timeZone` is supplied, preserving legacy behaviour.
 *
 * This is the companion to `getHourMinuteForInstantInZone` used for
 * calendar block positioning — when they both consult the provider
 * timezone, the label text and the vertical slot position stay aligned
 * even when the provider's phone is in a different zone (travel, DST).
 */
export function formatTimeInZone(
  dateStr: string | Date | null | undefined,
  timeZone: string | null | undefined,
): string {
  if (!dateStr) return "";
  const d = dateStr instanceof Date ? dateStr : parseIsoSafe(dateStr);
  if (!d) return typeof dateStr === "string" ? dateStr : "";
  if (timeZone) {
    try {
      const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).formatToParts(d);
      const hour = parts.find((p) => p.type === "hour")?.value ?? "";
      const minute = parts.find((p) => p.type === "minute")?.value ?? "";
      if (hour && minute) return `${hour === "24" ? "00" : hour}:${minute}`;
    } catch {
      // fall through to device-local format
    }
  }
  try {
    return format(d, "HH:mm");
  } catch {
    return typeof dateStr === "string" ? dateStr : "";
  }
}

export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  try {
    const parsed = parseIsoSafe(dateStr);
    return parsed ? format(parsed, "MMM d, yyyy 'at' HH:mm") : dateStr;
  } catch {
    return dateStr;
  }
}

export function formatRelativeDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  try {
    const date = parseIsoSafe(dateStr);
    if (!date) return dateStr;
    if (isToday(date)) return `Today at ${format(date, "HH:mm")}`;
    if (isTomorrow(date)) return `Tomorrow at ${format(date, "HH:mm")}`;
    if (isYesterday(date)) return `Yesterday at ${format(date, "HH:mm")}`;
    return format(date, "MMM d 'at' HH:mm");
  } catch {
    return dateStr;
  }
}

export function formatTimeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  try {
    const parsed = parseIsoSafe(dateStr);
    return parsed ? formatDistanceToNow(parsed, { addSuffix: true }) : dateStr;
  } catch {
    return dateStr;
  }
}

export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "0min";
  if (minutes < 60) return `${minutes}min`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

export function formatPhone(phone: string): string {
  if (!phone) return "";
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length === 10) {
    return `${cleaned.slice(0, 3)} ${cleaned.slice(3, 6)} ${cleaned.slice(6)}`;
  }
  if (cleaned.length === 11 || cleaned.length === 12) {
    return `+${cleaned.slice(0, cleaned.length - 10)} ${cleaned.slice(-10, -7)} ${cleaned.slice(-7, -4)} ${cleaned.slice(-4)}`;
  }
  return phone;
}

export function formatPercentage(value: number): string {
  if (!Number.isFinite(value)) return "0.0%";
  return `${value.toFixed(1)}%`;
}

export function getInitials(name: string): string {
  if (!name?.trim()) return "?";
  return name
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function getStatusColor(status: string): { bg: string; text: string; dot: string } {
  switch (status) {
    case "confirmed":
    case "completed":
      return { bg: "#f0fdf4", text: "#15803d", dot: "#22c55e" };
    case "pending":
    case "booked":
      return { bg: "#fefce8", text: "#a16207", dot: "#eab308" };
    case "in_progress":
    case "started":
      return { bg: "#eff6ff", text: "#1d4ed8", dot: "#3b82f6" };
    case "cancelled":
      return { bg: "#fef2f2", text: "#b91c1c", dot: "#ef4444" };
    case "no_show":
      return { bg: "#f3f4f6", text: "#4b5563", dot: "#9ca3af" };
    default:
      return { bg: "#f9fafb", text: "#4b5563", dot: "#9ca3af" };
  }
}

export function capitalizeFirst(str: string): string {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1).replace(/_/g, " ");
}

/**
 * Human-readable labels for raw enum/status strings that otherwise leak to the
 * UI (booking statuses, payout/payment statuses, ledger transaction types,
 * gift-card states). Unknown values fall back to Title Case of the de-snaked
 * string so we never render a raw `no_show` / `provider_earnings` token.
 */
const STATUS_LABELS: Record<string, string> = {
  // Booking lifecycle
  pending: "Pending",
  pending_approval: "Pending approval",
  booked: "Booked",
  confirmed: "Confirmed",
  in_progress: "In progress",
  started: "Started",
  completed: "Completed",
  cancelled: "Cancelled",
  canceled: "Cancelled",
  no_show: "No-show",
  rescheduled: "Rescheduled",
  declined: "Declined",
  expired: "Expired",
  // Payment / payout statuses
  processing: "Processing",
  paid: "Paid",
  unpaid: "Unpaid",
  partially_paid: "Partially paid",
  succeeded: "Succeeded",
  success: "Successful",
  failed: "Failed",
  refunded: "Refunded",
  partially_refunded: "Partially refunded",
  voided: "Voided",
  active: "Active",
  inactive: "Inactive",
  redeemed: "Redeemed",
  // Ledger transaction types
  provider_earnings: "Earnings",
  platform_fee: "Platform fee",
  service_fee: "Service fee",
  payout: "Payout",
  refund: "Refund",
  tip: "Tip",
  travel_fee: "Travel fee",
  cancellation_fee: "Cancellation fee",
  tax: "Tax",
  provider_subscription_payment: "Subscription payment",
  provider_ads_payment: "Ads payment",
};

export function formatStatusLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const key = value.trim().toLowerCase();
  if (!key) return "—";
  if (STATUS_LABELS[key]) return STATUS_LABELS[key];
  return key
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
