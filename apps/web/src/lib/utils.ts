import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency: string = "ZAR"): string {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-ZA", {
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
