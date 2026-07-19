const SENSITIVE = new Set([
  "password",
  "secret",
  "api_key",
  "access_token",
  "refresh_token",
  "card_number",
  "cvv",
  "bank_account_number",
]);

export function redactObject<T extends Record<string, unknown>>(obj: T, allowlist?: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (allowlist && !allowlist.includes(k)) continue;
    if (SENSITIVE.has(k.toLowerCase())) {
      out[k] = "[REDACTED]";
    } else if (v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = redactObject(v as Record<string, unknown>, allowlist);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function truncateOutput(json: string, maxBytes: number): string {
  if (Buffer.byteLength(json, "utf8") <= maxBytes) return json;
  return json.slice(0, maxBytes) + "…[truncated]";
}
