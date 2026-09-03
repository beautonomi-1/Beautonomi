/**
 * Prompt-level PII redaction for free text that is sent to an LLM (support
 * ticket subjects/bodies, provider capsules). Complements
 * `@beautonomi/agent-tools` `redactObject`, which only masks sensitive *keys*
 * (password, api_key, card_number, ...): here we also scrub PII *values* that
 * appear inline in prose.
 *
 * Deliberately conservative: emails, phone numbers, card-like digit runs,
 * South African ID numbers, IBAN-ish strings. Names are left intact because the
 * triage prompt needs the customer's first name to draft a reply.
 */
import { redactObject } from "@beautonomi/agent-tools";

const PATTERNS: Array<{ re: RegExp; token: string }> = [
  // Email addresses.
  { re: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, token: "[EMAIL]" },
  // South African ID numbers (exactly 13 digits, no separators) — before the card pattern.
  { re: /\b\d{13}\b/g, token: "[ID_NUMBER]" },
  // Card-like runs: 14-19 digits with optional single spaces/dashes between digits.
  { re: /\b\d(?:[ -]?\d){13,18}\b/g, token: "[CARD]" },
  // IBAN-like account strings.
  { re: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g, token: "[IBAN]" },
  // Phone numbers: +27 / 0xx with 9-12 digits allowing spaces, dashes, parentheses.
  { re: /(?:\+?\d{1,3}[ -]?)?\(?\d{2,4}\)?[ -]?\d{3}[ -]?\d{3,4}\b/g, token: "[PHONE]" },
];

/** Scrub inline PII from free text. Idempotent; safe on empty input. */
export function redactPromptText(text: string | null | undefined): string {
  if (!text) return "";
  let out = String(text);
  for (const { re, token } of PATTERNS) {
    out = out.replace(re, token);
  }
  return out;
}

/**
 * Redact an object destined for a prompt: masks sensitive keys via
 * `redactObject`, then scrubs PII from every string value (recursively).
 */
export function redactPromptObject<T>(value: T): T {
  if (value == null) return value;
  if (typeof value === "string") return redactPromptText(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => redactPromptObject(v)) as unknown as T;
  if (typeof value === "object") {
    const keyMasked = redactObject(value as Record<string, unknown>);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(keyMasked)) {
      out[k] = v === "[REDACTED]" ? v : redactPromptObject(v);
    }
    return out as unknown as T;
  }
  return value;
}
