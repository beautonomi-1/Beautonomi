/**
 * Didit identity-verification provider.
 *
 * All Didit API communication goes through this module.  The rest of the
 * application only knows about the provider-neutral types in ../types.ts.
 *
 * Env vars required (server-side only):
 *   DIDIT_API_KEY        — x-api-key header for Didit API calls
 *   DIDIT_WORKFLOW_ID    — Workflow id configured in Didit console
 *   DIDIT_WEBHOOK_SECRET — secret_shared_key for webhook HMAC verification
 *   DIDIT_BASE_URL       — optional, defaults to https://verification.didit.me
 *   DIDIT_CALLBACK_URL   — optional redirect after verification
 *   DIDIT_ENVIRONMENT    — 'production' | 'sandbox', default 'production'
 */

import { createHmac, timingSafeEqual } from "crypto";
import type {
  DiditDecision,
  DiditSessionCreateParams,
  DiditSessionCreateResult,
  DiditStatusString,
  DiditWebhookPayload,
  NormalizedVerificationStatus,
} from "../types";

const DIDIT_BASE = (process.env.DIDIT_BASE_URL ?? "https://verification.didit.me").replace(/\/$/, "");
const DIDIT_API_KEY = process.env.DIDIT_API_KEY ?? "";
const DIDIT_WORKFLOW_ID = process.env.DIDIT_WORKFLOW_ID ?? "";
const DIDIT_WEBHOOK_SECRET = process.env.DIDIT_WEBHOOK_SECRET ?? "";

/** Returns true when all required Didit env vars are set. */
export function diditEnvPresent(): boolean {
  return Boolean(DIDIT_API_KEY && DIDIT_WORKFLOW_ID && DIDIT_WEBHOOK_SECRET);
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function diditFetch<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  if (!DIDIT_API_KEY) {
    throw new Error("DIDIT_API_KEY is not configured");
  }
  const url = `${DIDIT_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": DIDIT_API_KEY,
      ...(options?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let body = "";
    try { body = await res.text(); } catch { /* ignore */ }
    throw new Error(`Didit API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

// ── Session creation ──────────────────────────────────────────────────────────

export async function createDiditSession(
  params: DiditSessionCreateParams,
): Promise<DiditSessionCreateResult> {
  const workflowId = DIDIT_WORKFLOW_ID;
  if (!workflowId) throw new Error("DIDIT_WORKFLOW_ID is not configured");

  const body: Record<string, unknown> = {
    workflow_id: workflowId,
    vendor_data: params.vendor_data,
    // Deliver the callback reliably on both the initiating and completing device
    // (important for cross-device / mobile hand-off). See Didit create-session docs.
    callback_method: "both",
  };
  // Didit expects `language` (ISO 639-1), NOT `language_code`.
  const lang = normaliseLanguageCode(params.language_code);
  if (lang) body.language = lang;
  if (params.callback)      body.callback       = params.callback;
  if (params.metadata)      body.metadata       = params.metadata;
  if (params.contact_details) body.contact_details = params.contact_details;

  // expected_details must be snake_case; country codes must be ISO 3166-1 alpha-3.
  if (params.expected_details) {
    const ed = params.expected_details;
    const expected: Record<string, unknown> = {};
    if (ed.firstName)   expected.first_name    = ed.firstName;
    if (ed.lastName)    expected.last_name     = ed.lastName;
    if (ed.dateOfBirth) expected.date_of_birth = ed.dateOfBirth;
    // nationality / id_country want alpha-3; convert from our alpha-2 form or drop.
    const idCountryA3 = toAlpha3(ed.country);
    if (idCountryA3) expected.id_country = idCountryA3;
    const nationalityA3 = ed.nationality ? toAlpha3(ed.nationality) ?? ed.nationality : undefined;
    if (nationalityA3 && nationalityA3.length === 3) expected.nationality = nationalityA3;
    if (Object.keys(expected).length > 0) body.expected_details = expected;
  }

  return diditFetch<DiditSessionCreateResult>("/v3/session/", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * Didit accepts ISO 639-1 codes (and a few regional variants). Reduce a platform
 * locale like "en-ZA" / "pt_BR" to a supported code, defaulting to English.
 */
const DIDIT_SUPPORTED_LANGS = new Set([
  "en","ar","bg","bn","bs","ca","cnr","cs","da","de","el","es","et","fa","fi",
  "fr","he","hi","hr","hu","hy","id","it","ja","ka","kk","ko","ky","lt","lv",
  "mk","mn","ms","nl","no","pl","pt-BR","pt","ro","ru","sk","sl","so","sq","sr",
  "sv","th","tr","uk","uz","vi","zh-CN","zh-TW","zh",
]);

function normaliseLanguageCode(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const lower = raw.toLowerCase().replace("_", "-");
  if (DIDIT_SUPPORTED_LANGS.has(lower)) return lower;          // pt-br won't match; handle variants
  if (lower === "pt-br") return "pt-BR";
  if (lower === "zh-cn") return "zh-CN";
  if (lower === "zh-tw") return "zh-TW";
  const base = lower.split("-")[0];
  return DIDIT_SUPPORTED_LANGS.has(base) ? base : "en";
}

/** ISO 3166-1 alpha-2 → alpha-3 for the countries the platform serves. */
const ALPHA2_TO_ALPHA3: Record<string, string> = {
  ZA: "ZAF", ZW: "ZWE", MZ: "MOZ", LS: "LSO", SZ: "SWZ", BW: "BWA",
  NA: "NAM", ZM: "ZMB", MW: "MWI", TZ: "TZA", KE: "KEN", NG: "NGA",
  GB: "GBR", US: "USA", CA: "CAN", AU: "AUS", IN: "IND",
};

function toAlpha3(code: string | null | undefined): string | undefined {
  if (!code) return undefined;
  const upper = code.trim().toUpperCase();
  if (upper.length === 3) return upper;                 // already alpha-3
  return ALPHA2_TO_ALPHA3[upper];                       // undefined if unknown → omit
}

// ── Decision fetch (for reconciliation) ──────────────────────────────────────

export async function getDiditDecision(sessionId: string): Promise<DiditDecision> {
  return diditFetch<DiditDecision>(`/v3/session/${sessionId}/decision/`);
}

// ── Status normalization ──────────────────────────────────────────────────────

/**
 * Maps Didit status strings (case-sensitive) to our normalized enum.
 *
 * Didit strings: "Not Started" | "In Progress" | "Resubmitted" | "In Review" |
 *                "Approved"    | "Declined"    | "Abandoned"   | "Expired"   |
 *                "Kyc Expired"
 */
export function normalizeDiditStatus(
  diditStatus: string | null | undefined,
): NormalizedVerificationStatus {
  switch (diditStatus) {
    case "Not Started":   return "session_created";
    case "In Progress":   return "in_progress";
    case "Resubmitted":   return "in_progress";
    case "Awaiting User": return "in_progress";
    case "In Review":     return "pending_review";
    case "Approved":      return "approved";
    case "Declined":      return "rejected";
    case "Abandoned":     return "abandoned";
    case "Expired":       return "expired";
    case "Kyc Expired":   return "expired";
    default:              return "errored";
  }
}

/** Whether the Didit status is the special KYC-expiry variant. */
export function isKycExpired(diditStatus: string | null | undefined): boolean {
  return diditStatus === "Kyc Expired";
}

/**
 * Normalise a Didit timestamp to an ISO string.
 * Didit sends `timestamp` / `created_at` in webhook bodies as Unix epoch SECONDS
 * (integers); decision `created_at` is an ISO string. Handle both.
 */
export function diditTimestampToIso(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    // Heuristic: seconds vs milliseconds
    const ms = value < 1e12 ? value * 1000 : value;
    return new Date(ms).toISOString();
  }
  if (typeof value === "string" && value) {
    const n = Number(value);
    if (Number.isFinite(n) && /^\d+$/.test(value.trim())) {
      const ms = n < 1e12 ? n * 1000 : n;
      return new Date(ms).toISOString();
    }
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  return new Date().toISOString();
}

// ── Webhook signature verification ───────────────────────────────────────────

/**
 * Match Didit's float normalisation: whole-valued floats are serialised as ints.
 * (No-op in practice for JS-parsed JSON, but kept for byte-for-byte fidelity.)
 */
function shortenFloats(data: unknown): unknown {
  if (Array.isArray(data)) return data.map(shortenFloats);
  if (data !== null && typeof data === "object") {
    return Object.fromEntries(
      Object.entries(data as Record<string, unknown>).map(([k, v]) => [k, shortenFloats(v)]),
    );
  }
  if (typeof data === "number" && !Number.isInteger(data) && data % 1 === 0) {
    return Math.trunc(data);
  }
  return data;
}

/** Sort object keys recursively before re-stringifying (matches Python sort_keys=True). */
function sortKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(sortKeys);
  if (obj !== null && typeof obj === "object") {
    return Object.keys(obj as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortKeys((obj as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return obj;
}

/** Constant-time compare of two hex-digest strings. */
function safeCompareHex(expectedHex: string, providedHex: string): boolean {
  try {
    const provided = providedHex.startsWith("sha256=") ? providedHex.slice(7) : providedHex;
    const a = Buffer.from(expectedHex, "utf8");
    const b = Buffer.from(provided, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Verify a Didit webhook using the three signature variants Didit sends, each
 * with its OWN algorithm (per https://docs.didit.me/integration/webhooks):
 *
 *   X-Signature-V2      → HMAC-SHA256(secret, canonicalJSON)   [recommended, authenticates body]
 *   X-Signature         → HMAC-SHA256(secret, rawBodyBytes)    [only if raw body untouched]
 *   X-Signature-Simple  → HMAC-SHA256(secret, "{ts}:{session_id}:{status}:{webhook_type}")  [envelope only]
 *
 * canonicalJSON = JSON.stringify(sortKeys(shortenFloats(parsed))) — sorted keys,
 * compact separators, Unicode preserved (ensure_ascii=False equivalent).
 *
 * Rejects replays where |now - X-Timestamp| > 300 seconds.
 * The "simple" variant does NOT authenticate `decision`; callers should re-fetch
 * the decision from the API when relying on it.
 */
export function verifyDiditWebhookSignature(params: {
  rawBody: Buffer;
  signatureV2: string | null;
  signatureRaw: string | null;
  signatureSimple: string | null;
  timestamp: string | null;
}): { ok: true; variant: "v2" | "raw" | "simple" } | { ok: false } {
  const { rawBody, signatureV2, signatureRaw, signatureSimple, timestamp } = params;
  if (!DIDIT_WEBHOOK_SECRET) return { ok: false };
  if (!signatureV2 && !signatureRaw && !signatureSimple) return { ok: false };

  // Replay window: reject if timestamp is more than 300s off (X-Timestamp is epoch seconds)
  if (timestamp) {
    const ts = Number(timestamp);
    if (Number.isFinite(ts)) {
      const diffSeconds = Math.abs(Date.now() / 1000 - ts);
      if (diffSeconds > 300) return { ok: false };
    }
  }

  const secret = Buffer.from(DIDIT_WEBHOOK_SECRET, "utf8");

  // Parse once for V2 canonicalisation + Simple envelope fields.
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(rawBody.toString("utf8")) as Record<string, unknown>;
  } catch {
    parsed = null;
  }

  // 1. V2 — canonical JSON (recommended; survives middleware re-encoding)
  if (signatureV2 && parsed) {
    const canonical = JSON.stringify(sortKeys(shortenFloats(parsed)));
    const v2Hmac = createHmac("sha256", secret).update(canonical, "utf8").digest("hex");
    if (safeCompareHex(v2Hmac, signatureV2)) return { ok: true, variant: "v2" };
  }

  // 2. Raw — exact bytes as transmitted
  if (signatureRaw) {
    const rawHmac = createHmac("sha256", secret).update(rawBody).digest("hex");
    if (safeCompareHex(rawHmac, signatureRaw)) return { ok: true, variant: "raw" };
  }

  // 3. Simple — envelope-only canonical string
  if (signatureSimple && parsed) {
    const canonicalSimple = [
      parsed.timestamp ?? "",
      parsed.session_id ?? "",
      parsed.status ?? "",
      parsed.webhook_type ?? "",
    ].join(":");
    const simpleHmac = createHmac("sha256", secret).update(canonicalSimple, "utf8").digest("hex");
    if (safeCompareHex(simpleHmac, signatureSimple)) return { ok: true, variant: "simple" };
  }

  return { ok: false };
}

// ── PII minimisation ──────────────────────────────────────────────────────────

/**
 * Strip PII from a Didit decision payload before DB storage.
 * Keeps: statuses, warning codes, risk scores.
 * Strips: document numbers, DOB, full names, images.
 */
export function sanitiseDecisionForStorage(
  decision: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!decision) return {};
  const STRIP_KEYS = new Set([
    "document_number", "date_of_birth", "first_name", "last_name",
    "personal_number", "nationality_number", "mrz_line1", "mrz_line2",
    "image", "portrait", "face_image", "document_front", "document_back",
    "address",
  ]);

  function scrub(obj: unknown): unknown {
    if (typeof obj !== "object" || obj === null) return obj;
    if (Array.isArray(obj)) return obj.map(scrub);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (STRIP_KEYS.has(k)) continue;
      out[k] = scrub(v);
    }
    return out;
  }

  return scrub(decision) as Record<string, unknown>;
}

/** Extract rejection reasons from a Didit decision's warnings. */
export function extractRejectionReason(
  decision: Record<string, unknown> | null | undefined,
): string | null {
  if (!decision) return null;
  const warnings: string[] = [];

  function collectWarnings(obj: unknown) {
    if (typeof obj !== "object" || obj === null) return;
    if (Array.isArray(obj)) { obj.forEach(collectWarnings); return; }
    const o = obj as Record<string, unknown>;
    if (typeof o.short_description === "string") warnings.push(o.short_description);
    for (const v of Object.values(o)) collectWarnings(v);
  }

  collectWarnings(decision);
  return warnings.length ? warnings[0] : null;
}

/** Extract verified legal identity from a Didit decision (authoritative source). */
export interface ExtractedLegalIdentity {
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  nationality?: string;
  documentType?: string;
  documentCountry?: string;
}

export function extractLegalIdentityFromDecision(
  decision: Record<string, unknown> | null | undefined,
): ExtractedLegalIdentity | null {
  if (!decision) return null;
  const idVerifications = decision.id_verifications as unknown[] | undefined;
  const first = Array.isArray(idVerifications) ? idVerifications[0] : null;
  if (!first || typeof first !== "object") return null;
  const v = first as Record<string, unknown>;
  // Didit uses `issuing_state` (ISO alpha-3) on id_verifications; older shapes use `issuing_country`.
  const issuing = typeof v.issuing_state === "string" ? v.issuing_state
    : typeof v.issuing_country === "string" ? v.issuing_country
    : undefined;
  return {
    firstName:      typeof v.first_name     === "string" ? v.first_name     : undefined,
    lastName:       typeof v.last_name      === "string" ? v.last_name      : undefined,
    dateOfBirth:    typeof v.date_of_birth  === "string" ? v.date_of_birth  : undefined,
    nationality:    typeof v.nationality    === "string" ? v.nationality    : undefined,
    documentType:   typeof v.document_type  === "string" ? v.document_type  : undefined,
    documentCountry:issuing,
  };
}

export { DIDIT_WORKFLOW_ID, DIDIT_BASE };
