import type { ErrorEvent, EventHint, TransactionEvent } from "@sentry/core";

const SENSITIVE_PATH_PREFIXES = [
  "/api/webhooks/",
  "/api/payments/webhook",
  "/api/auth/sign-in",
  "/api/auth/sign-up",
  "/api/me/payment-methods",
  "/api/paystack/verify",
];

const SENSITIVE_HEADER_NAMES = new Set([
  "authorization",
  "cookie",
  "x-api-key",
  "x-supabase-auth",
  "x-paystack-signature",
  "x-yoco-signature",
  "x-yoco-webhook-id",
  "x-twilio-signature",
  "x-wasender-signature",
  "x-hub-signature-256",
  "stripe-signature",
]);

const SENSITIVE_BODY_KEYS = new Set([
  "card_number",
  "cardNumber",
  "cvv",
  "cvc",
  "pin",
  "otp",
  "token",
  "authorization_code",
  "password",
  "secret",
  "api_key",
  "apiKey",
  "access_token",
  "refresh_token",
  "id_token",
  "email",
  "phone",
  "dateOfBirth",
  "date_of_birth",
  "id_number",
]);

function isSensitiveUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const path = new URL(url, "http://local").pathname;
    return SENSITIVE_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));
  } catch {
    return SENSITIVE_PATH_PREFIXES.some((prefix) => url.includes(prefix));
  }
}

function scrubHeaders(headers: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!headers) return headers;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    out[key] = SENSITIVE_HEADER_NAMES.has(key.toLowerCase()) ? "[redacted]" : value;
  }
  return out;
}

function scrubBody(value: unknown, depth = 0): unknown {
  if (depth > 6 || value == null) return value;
  if (typeof value === "string") return value.length > 1024 ? value.slice(0, 1024) + "…" : value;
  if (Array.isArray(value)) return value.map((v) => scrubBody(v, depth + 1));
  if (typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_BODY_KEYS.has(key)) {
      out[key] = "[redacted]";
    } else {
      out[key] = scrubBody(raw, depth + 1);
    }
  }
  return out;
}

function eventText(event: ErrorEvent): string {
  const values = event.exception?.values?.map((v) => `${v.type ?? ""} ${v.value ?? ""}`).join(" ") ?? "";
  const message = typeof event.message === "string" ? event.message : "";
  return `${message} ${values}`;
}

function isSupabaseAuthLockEvent(event: ErrorEvent): boolean {
  const text = eventText(event);
  return text.includes("Lock ") && text.includes("was released because another request stole it");
}

/**
 * Sentry beforeSend hook. Strips PII, credentials, and full webhook bodies.
 * Applied to server, edge, and browser clients so shape of event is the same everywhere.
 */
export function scrubSentryEvent(event: ErrorEvent, _hint?: EventHint): ErrorEvent | null {
  if (isSupabaseAuthLockEvent(event)) {
    return null;
  }

  if (event.user) {
    // Only keep an opaque user id, never email/ip/username.
    const id = event.user.id;
    event.user = id ? { id: String(id) } : undefined;
  }

  const request = event.request;
  if (request) {
    request.headers = scrubHeaders(request.headers as Record<string, string> | undefined);
    request.cookies = undefined;
    if (request.data) {
      if (isSensitiveUrl(request.url)) {
        request.data = "[redacted: sensitive endpoint]";
      } else {
        try {
          const parsed = typeof request.data === "string" ? JSON.parse(request.data) : request.data;
          request.data = scrubBody(parsed);
        } catch {
          request.data = "[non-JSON body omitted]";
        }
      }
    }
    if (typeof request.query_string === "string" && request.query_string.length > 256) {
      request.query_string = request.query_string.slice(0, 256) + "…";
    }
  }

  if (event.extra && typeof event.extra === "object") {
    event.extra = scrubBody(event.extra) as Record<string, unknown>;
  }
  if (event.contexts?.state) {
    delete event.contexts.state;
  }
  return event;
}

export function scrubSentryTransaction(event: TransactionEvent): TransactionEvent | null {
  if (event.request) {
    event.request.headers = scrubHeaders(event.request.headers as Record<string, string> | undefined);
    event.request.cookies = undefined;
    event.request.data = undefined;
  }
  return event;
}
