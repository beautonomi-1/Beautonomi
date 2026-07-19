import { createHash } from "node:crypto";

/** Stable canonical JSON for payload hashing. */
export function canonicalizeJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalizeJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalizeJson(obj[k])}`).join(",")}}`;
}

export function hashPayload(payload: unknown): string {
  return createHash("sha256").update(canonicalizeJson(payload)).digest("hex");
}
