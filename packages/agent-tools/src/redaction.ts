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

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x7f) bytes += 1;
    else if (code <= 0x7ff) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      i += 1;
    } else bytes += 3;
  }
  return bytes;
}

export function truncateOutput(json: string, maxBytes: number): string {
  if (utf8ByteLength(json) <= maxBytes) return json;
  return json.slice(0, maxBytes) + "…[truncated]";
}
