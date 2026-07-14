/**
 * Server-side WasenderAPI client.
 *
 * Reads credentials from `wasender_integration_config` (DB) with env fallback
 * (`WASENDER_PAT`). Account-level routes use the Personal Access Token; messaging
 * and `/api/on-whatsapp/...` use each session's `api_key` (Bearer) from session details.
 *
 * WasenderAPI docs: https://wasenderapi.com/api-docs
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveProviderAppLinks } from "@/lib/provider-ops/resolve-provider-app-links";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WasenderConfig {
  pat: string;
  baseUrl: string;
}

export interface WasenderSession {
  id: number;
  name: string;
  status: string;
  phone?: string;
  phone_number?: string;
  api_key?: string;
}

export interface WasenderSessionStatus {
  status: string;
  phone?: string;
  name?: string;
}

export interface WasenderSendResult {
  success: boolean;
  message?: string;
  data?: {
    id?: string;
    msgId?: string | number;
    jid?: string;
    status?: string;
    [key: string]: unknown;
  };
}

export interface WasenderNumberCheckResult {
  exists: boolean;
  jid?: string;
}

/** Official API examples use https://www.wasenderapi.com — `app` subdomain may differ. */
const DEFAULT_WASENDER_BASE = "https://www.wasenderapi.com";

// ---------------------------------------------------------------------------
// Response shape: { success: true, data: ... }
// ---------------------------------------------------------------------------

function unwrapWasenderPayload(raw: unknown): unknown {
  if (
    raw &&
    typeof raw === "object" &&
    "success" in raw &&
    (raw as { success?: boolean }).success === true &&
    "data" in raw
  ) {
    return (raw as { data: unknown }).data;
  }
  return raw;
}

// ---------------------------------------------------------------------------
// Credential resolution — DB first, env fallback
// ---------------------------------------------------------------------------

export async function getWasenderConfig(
  tenantId?: string | null,
  environment = "production",
): Promise<WasenderConfig | null> {
  const envPat = process.env.WASENDER_PAT?.trim();

  try {
    const supabase = getSupabaseAdmin();

    let query = supabase
      .from("wasender_integration_config")
      .select("personal_access_token_secret, base_url, enabled")
      .eq("environment", environment)
      .eq("enabled", true);

    query = tenantId ? query.eq("tenant_id", tenantId) : query.is("tenant_id", null);

    const { data } = await query.maybeSingle();

    const row = data as {
      personal_access_token_secret?: string;
      base_url?: string;
      enabled?: boolean;
    } | null;

    if (row?.personal_access_token_secret) {
      return {
        pat: row.personal_access_token_secret,
        baseUrl: (row.base_url || DEFAULT_WASENDER_BASE).replace(/\/+$/, ""),
      };
    }
  } catch {
    // DB unavailable — fall through to env
  }

  if (envPat) {
    return {
      pat: envPat,
      baseUrl: (process.env.WASENDER_BASE_URL || DEFAULT_WASENDER_BASE).replace(/\/+$/, ""),
    };
  }

  return null;
}

/** Map Wasender session status string to our `whatsapp_sessions.status` enum. */
export function mapRemoteSessionStatus(remote: string | undefined): string | null {
  if (!remote) return null;
  const lower = remote.toLowerCase();
  if (["connected", "open", "ready"].includes(lower)) return "connected";
  if (["disconnected", "closed", "logged_out"].includes(lower)) return "disconnected";
  if (["qr", "qr_required", "scan_qr"].includes(lower)) return "qr_required";
  if (["connecting", "loading"].includes(lower)) return "connecting";
  return "error";
}

/**
 * Load session `api_key` from Wasender (GET session details) and store on `whatsapp_sessions`.
 * Messaging endpoints require this Bearer token — the account PAT is not valid for POST /api/send-message.
 */
export async function fetchAndPersistSessionApiKey(
  tenantId: string,
  localSessionId: string,
  wasenderSessionId: string,
): Promise<string | null> {
  const config = await getWasenderConfig(tenantId);
  if (!config) return null;

  let details: Record<string, unknown>;
  try {
    details = await getSessionDetails(config, wasenderSessionId);
  } catch {
    return null;
  }

  const apiKey = typeof details.api_key === "string" ? details.api_key : null;
  if (!apiKey?.trim()) return null;

  const phone = typeof details.phone_number === "string" ? details.phone_number : null;
  const mapped = typeof details.status === "string" ? mapRemoteSessionStatus(details.status) : null;

  const supabase = getSupabaseAdmin();
  await supabase
    .from("whatsapp_sessions")
    .update({
      wasender_session_api_key: apiKey.trim(),
      ...(phone ? { phone_number: phone } : {}),
      ...(mapped ? { status: mapped } : {}),
      last_status_check_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", localSessionId)
    .eq("tenant_id", tenantId);

  return apiKey.trim();
}

/** Bearer token for /api/send-message: stored session key, or fetch from Wasender if missing. */
export async function resolveSessionMessagingBearer(
  tenantId: string,
  session: {
    id: string;
    wasender_session_id: string;
    wasender_session_api_key?: string | null;
  },
): Promise<string | null> {
  const existing = session.wasender_session_api_key?.trim();
  if (existing) return existing;
  return fetchAndPersistSessionApiKey(tenantId, session.id, session.wasender_session_id);
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function wasenderFetch<T = unknown>(
  baseUrl: string,
  path: string,
  token: string,
  options: {
    method?: string;
    body?: unknown;
  } = {},
): Promise<{ ok: boolean; status: number; data: T; raw?: unknown }> {
  const url = `${baseUrl}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
  };

  const res = await fetch(url, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch {
    parsed = null;
  }

  return {
    ok: res.ok,
    status: res.status,
    data: parsed as T,
    raw: parsed,
  };
}

// ---------------------------------------------------------------------------
// Account-level operations (PAT auth)
// ---------------------------------------------------------------------------

/** List all WhatsApp sessions on the account. */
export async function listSessions(config: WasenderConfig): Promise<WasenderSession[]> {
  const res = await wasenderFetch<unknown>(config.baseUrl, "/api/whatsapp-sessions", config.pat);
  if (!res.ok) throw new Error(`Failed to list sessions: ${res.status}`);
  const unwrapped = unwrapWasenderPayload(res.data);
  if (Array.isArray(unwrapped)) return unwrapped as WasenderSession[];
  return [];
}

export type CreateSessionOptions = {
  /** E.164, required by WasenderAPI for POST /api/whatsapp-sessions */
  phone_number: string;
  account_protection?: boolean;
  log_messages?: boolean;
};

/** Create a new WhatsApp session (PAT). See https://wasenderapi.com/api-docs/sessions/create-whatsapp-session */
export async function createSession(
  config: WasenderConfig,
  name: string,
  options: CreateSessionOptions,
): Promise<WasenderSession> {
  const res = await wasenderFetch<unknown>(config.baseUrl, "/api/whatsapp-sessions", config.pat, {
    method: "POST",
    body: {
      name,
      phone_number: options.phone_number.trim(),
      account_protection: options.account_protection ?? true,
      log_messages: options.log_messages ?? true,
      read_incoming_messages: false,
    },
  });
  if (!res.ok) throw new Error(`Failed to create session: ${res.status}`);
  const unwrapped = unwrapWasenderPayload(res.data) as WasenderSession | undefined;
  if (!unwrapped || typeof unwrapped !== "object") {
    throw new Error("Invalid create session response");
  }
  return unwrapped;
}

/** Get session details (PAT). Includes `api_key` for messaging. */
export async function getSessionDetails(
  config: WasenderConfig,
  wasenderSessionId: string,
): Promise<Record<string, unknown>> {
  const res = await wasenderFetch<unknown>(
    config.baseUrl,
    `/api/whatsapp-sessions/${wasenderSessionId}`,
    config.pat,
  );
  if (!res.ok) throw new Error(`Failed to get session: ${res.status}`);
  const unwrapped = unwrapWasenderPayload(res.data);
  return (unwrapped && typeof unwrapped === "object" ? unwrapped : {}) as Record<string, unknown>;
}

/** Delete a session. */
export async function deleteSession(config: WasenderConfig, wasenderSessionId: string): Promise<void> {
  const res = await wasenderFetch(
    config.baseUrl,
    `/api/whatsapp-sessions/${wasenderSessionId}`,
    config.pat,
    { method: "DELETE" },
  );
  if (!res.ok) throw new Error(`Failed to delete session: ${res.status}`);
}

// ---------------------------------------------------------------------------
// Session-level operations (PAT for connect/QR; session API key for status/send)
// ---------------------------------------------------------------------------

/** Connect (initiate) a session — triggers QR generation. */
export async function connectSession(
  config: WasenderConfig,
  wasenderSessionId: string,
): Promise<Record<string, unknown>> {
  const res = await wasenderFetch<unknown>(
    config.baseUrl,
    `/api/whatsapp-sessions/${wasenderSessionId}/connect`,
    config.pat,
    { method: "POST" },
  );
  if (!res.ok) throw new Error(`Failed to connect session: ${res.status}`);
  const unwrapped = unwrapWasenderPayload(res.data);
  return (unwrapped && typeof unwrapped === "object" ? unwrapped : {}) as Record<string, unknown>;
}

/** Get QR code for session linking. */
export async function getSessionQrCode(
  config: WasenderConfig,
  wasenderSessionId: string,
): Promise<{ qrCode?: string; qr_code?: string }> {
  const res = await wasenderFetch<unknown>(
    config.baseUrl,
    `/api/whatsapp-sessions/${wasenderSessionId}/qrcode`,
    config.pat,
  );
  if (!res.ok) throw new Error(`Failed to get QR code: ${res.status}`);
  const unwrapped = unwrapWasenderPayload(res.data);
  const o = unwrapped && typeof unwrapped === "object" ? (unwrapped as Record<string, unknown>) : {};
  return {
    qrCode: typeof o.qrCode === "string" ? o.qrCode : undefined,
    qr_code: typeof o.qr_code === "string" ? o.qr_code : undefined,
  };
}

/** Get session connection status (session Bearer). */
export async function getSessionStatus(
  baseUrl: string,
  sessionApiKey: string,
): Promise<WasenderSessionStatus> {
  const res = await wasenderFetch<unknown>(baseUrl, "/api/status", sessionApiKey);
  if (!res.ok) throw new Error(`Failed to get status: ${res.status}`);
  const unwrapped = unwrapWasenderPayload(res.data);
  return (unwrapped && typeof unwrapped === "object" ? unwrapped : res.data) as WasenderSessionStatus;
}

/** Disconnect a session. */
export async function disconnectSession(
  config: WasenderConfig,
  wasenderSessionId: string,
): Promise<void> {
  const res = await wasenderFetch(
    config.baseUrl,
    `/api/whatsapp-sessions/${wasenderSessionId}/disconnect`,
    config.pat,
    { method: "POST" },
  );
  if (!res.ok) throw new Error(`Failed to disconnect session: ${res.status}`);
}

// ---------------------------------------------------------------------------
// Messaging (session API key auth)
// ---------------------------------------------------------------------------

/**
 * Send a text message. Docs: POST /api/send-message with body `{ to, text }`.
 * https://wasenderapi.com/api-docs/messages/send-text-message
 */
export async function sendTextMessage(
  baseUrl: string,
  sessionApiKey: string,
  to: string,
  text: string,
): Promise<WasenderSendResult> {
  const res = await wasenderFetch<unknown>(baseUrl, "/api/send-message", sessionApiKey, {
    method: "POST",
    body: { to, text },
  });
  const raw = res.data as Record<string, unknown> | null;
  const inner = unwrapWasenderPayload(res.data) as Record<string, unknown> | undefined;
  const dataBlock =
    inner && typeof inner === "object"
      ? inner
      : raw && typeof raw === "object" && "data" in raw
        ? (raw.data as Record<string, unknown>)
        : (raw as Record<string, unknown> | undefined);

  return {
    success: res.ok,
    message: typeof raw?.message === "string" ? raw.message : undefined,
    data: res.ok && dataBlock && typeof dataBlock === "object" ? (dataBlock as WasenderSendResult["data"]) : undefined,
  };
}

// ---------------------------------------------------------------------------
// Number verification (session API key auth)
// ---------------------------------------------------------------------------

/** Check if a phone number is registered on WhatsApp. */
export async function checkNumberOnWhatsApp(
  baseUrl: string,
  sessionApiKey: string,
  phoneNumber: string,
): Promise<WasenderNumberCheckResult> {
  const cleaned = phoneNumber.replace(/[^\d+]/g, "").replace(/^\+/, "");
  const res = await wasenderFetch<unknown>(
    baseUrl,
    `/api/on-whatsapp/${encodeURIComponent(cleaned)}`,
    sessionApiKey,
  );
  if (!res.ok) throw new Error(`Number check failed: ${res.status}`);
  const unwrapped = unwrapWasenderPayload(res.data);
  const d =
    unwrapped && typeof unwrapped === "object"
      ? (unwrapped as Record<string, unknown>)
      : (res.data as Record<string, unknown>);
  return {
    exists: Boolean(d?.exists ?? (d as { result?: boolean })?.result),
    jid: typeof d?.jid === "string" ? d.jid : typeof d?.number === "string" ? d.number : undefined,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve template placeholders with lead data and optional tenant app/onboarding links. */
export async function resolveTemplatePlaceholders(
  template: string,
  lead: Record<string, unknown>,
  options?: {
    supabase?: SupabaseClient;
    tenantId?: string;
    baseUrl?: string;
  },
): Promise<string> {
  const nameStr = String(lead.contact_person_name || lead.lead_name || lead.business_name || "");
  const parts = nameStr.trim().split(/\s+/);
  const firstName = parts[0] || "";
  const lastName = parts.slice(1).join(" ") || "";

  const vars: Record<string, string> = {
    first_name: firstName,
    last_name: lastName,
    full_name: nameStr.trim(),
    email: String(lead.email || ""),
    phone: String(lead.phone_e164 || ""),
    business_name: String(lead.business_name || ""),
    company: String(lead.business_name || ""),
    app_link_ios: "",
    app_link_android: "",
    onboarding_link: "",
  };

  if (options?.supabase && options?.tenantId) {
    const appLinks = await resolveProviderAppLinks(options.supabase, options.tenantId);
    vars.app_link_ios = appLinks.ios ?? "";
    vars.app_link_android = appLinks.android ?? "";

    const inviteToken =
      typeof lead.invite_token === "string" && lead.invite_token.trim()
        ? lead.invite_token.trim()
        : "";
    const base =
      options.baseUrl?.replace(/\/$/, "") ||
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
      "";
    vars.onboarding_link =
      inviteToken && base ? `${base}/provider/onboarding?invite=${inviteToken}` : "";
  }

  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    return vars[key.toLowerCase()] ?? `{{${key}}}`;
  });
}

/** Normalize a phone number to E.164-like format for WasenderAPI. */
export function normalizePhoneForWasender(phone: string): string {
  return phone.replace(/[\s\-().]/g, "").replace(/^00/, "+");
}
