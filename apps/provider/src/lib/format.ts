/**
 * Formatting utilities for currency, dates, durations, etc.
 */
import { format, formatDistanceToNow, isToday, isTomorrow, isYesterday, parseISO } from "date-fns";

export function formatCurrency(amount: number, currency = "ZAR"): string {
  if (!Number.isFinite(amount)) amount = 0;
  const symbol = currency === "ZAR" ? "R" : currency === "USD" ? "$" : currency;
  return `${symbol}${amount.toFixed(2)}`;
}

export function formatCurrencyShort(amount: number): string {
  if (!Number.isFinite(amount)) amount = 0;
  if (amount >= 1_000_000) return `R${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `R${(amount / 1_000).toFixed(1)}K`;
  return `R${amount.toFixed(0)}`;
}

export function formatDate(dateStr: string | null | undefined, fmt = "MMM d, yyyy"): string {
  if (!dateStr) return "";
  try {
    return format(parseISO(dateStr), fmt);
  } catch {
    return dateStr;
  }
}

export function formatTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  try {
    return format(parseISO(dateStr), "HH:mm");
  } catch {
    return dateStr;
  }
}

export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  try {
    return format(parseISO(dateStr), "MMM d, yyyy 'at' HH:mm");
  } catch {
    return dateStr;
  }
}

export function formatRelativeDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  try {
    const date = parseISO(dateStr);
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
    return formatDistanceToNow(parseISO(dateStr), { addSuffix: true });
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
