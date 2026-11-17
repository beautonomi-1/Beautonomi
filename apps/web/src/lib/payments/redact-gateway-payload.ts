/**
 * POPIA (F2-69): gateway webhook payloads are persisted verbatim for replay /
 * forensics. Card and customer PII must never reach the event tables — mask
 * it before insert. Structure (ids, amounts, statuses, metadata keys) is kept
 * so the row still supports reconciliation.
 */

const REDACTED = "[REDACTED]";

/** Keys whose values are PII regardless of nesting (case-insensitive, snake/camel). */
const PII_KEYS = new Set(
  [
    "email",
    "customer_email",
    "customeremail",
    "phone",
    "phone_number",
    "phonenumber",
    "mobile",
    "msisdn",
    "name",
    "first_name",
    "firstname",
    "last_name",
    "lastname",
    "full_name",
    "fullname",
    "cardholder",
    "cardholder_name",
    "cardholdername",
    "card_holder",
    "holder_name",
    "address",
    "billing_address",
    "shipping_address",
    "street",
    "postal_code",
    "ip",
    "ip_address",
    "ipaddress",
    "user_agent",
    "card_number",
    "cardnumber",
    "pan",
    "number",
    "bin",
    "expiry",
    "expiry_month",
    "expirymonth",
    "expiry_year",
    "expiryyear",
    "exp_month",
    "exp_year",
    "cvv",
    "cvc",
    "token",
    "card_token",
    "access_token",
    "refresh_token",
    "secret",
    "signature",
    "id_number",
    "idnumber",
    "passport",
    "account_number",
    "accountnumber",
  ].map((k) => k.toLowerCase()),
);

/** Containers whose every leaf is PII (we keep only a few safe sub-keys). */
const PII_CONTAINERS = new Set(["card", "customer", "cardholder", "billing", "shipping", "payer", "buyer"]);

/** Safe sub-keys inside a PII container (non-identifying card descriptors). */
const SAFE_CONTAINER_KEYS = new Set(["last4", "last_four", "lastfour", "brand", "scheme", "type", "country", "funding"]);

const MAX_DEPTH = 12;

function normKey(key: string): string {
  return key.replace(/[-\s]/g, "_").toLowerCase();
}

function maskValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return value.length === 0 ? value : REDACTED;
  if (typeof value === "number" || typeof value === "boolean") return REDACTED;
  if (Array.isArray(value)) return value.map(maskValue);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SAFE_CONTAINER_KEYS.has(normKey(k)) ? v : maskValue(v);
    }
    return out;
  }
  return REDACTED;
}

function redactNode(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) return REDACTED;
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redactNode(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const nk = normKey(k);
    if (PII_CONTAINERS.has(nk)) {
      out[k] = maskValue(v);
    } else if (PII_KEYS.has(nk)) {
      out[k] = maskValue(v);
    } else {
      out[k] = redactNode(v, depth + 1);
    }
  }
  return out;
}

/**
 * Deep-copy `payload` with card / customer PII fields replaced by `[REDACTED]`.
 * Non-object input is returned unchanged.
 */
export function redactGatewayPayload<T>(payload: T): T {
  if (payload === null || typeof payload !== "object") return payload;
  return redactNode(payload, 0) as T;
}
