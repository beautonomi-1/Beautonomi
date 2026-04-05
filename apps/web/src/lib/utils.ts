import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency: string = LAST_RESORT_CURRENCY): string {
  const code = (currency || LAST_RESORT_CURRENCY).trim().toUpperCase();
  const safe = /^[A-Z]{3}$/.test(code) ? code : LAST_RESORT_CURRENCY;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: safe,
      minimumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${safe} ${amount.toFixed(2)}`;
  }
}

export function formatDate(date: Date | string, locale?: string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale ?? undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(d);
}

export function formatTime(time: string): string {
  // Accept ISO date string and extract HH:mm
  let hours: number;
  let minutes: string;
  if (time.includes("T") && /^\d{4}-\d{2}-\d{2}T/.test(time)) {
    const d = new Date(time);
    hours = d.getHours();
    minutes = String(d.getMinutes()).padStart(2, "0");
  } else {
    const [h, m] = time.split(":");
    hours = parseInt(h, 10);
    minutes = m ?? "00";
  }
  const ampm = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 || 12;
  return `${displayHour}:${minutes} ${ampm}`;
}
