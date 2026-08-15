import type { TrackingUpdate } from "./index";

export function mapCourierTrackingStatus(raw: string | null | undefined): TrackingUpdate["status"] {
  const s = (raw ?? "").toLowerCase().replace(/[_-]+/g, " ");
  if (s.includes("deliver") && !s.includes("out for")) return "delivered";
  if (s.includes("out for delivery") || s.includes("on vehicle")) return "out_for_delivery";
  if (s.includes("return")) return "returned";
  if (s.includes("exception") || s.includes("fail") || s.includes("cancel") || s.includes("undeliver")) {
    return "exception";
  }
  if (s.includes("transit") || s.includes("collected") || s.includes("picked") || s.includes("in depot")) {
    return "in_transit";
  }
  return "pending";
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function strField(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}
