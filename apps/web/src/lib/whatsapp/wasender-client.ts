/**
 * Server-side WasenderAPI client.
 *
 * Reads credentials from `wasender_integration_config` (DB) with env fallback
 * (`WASENDER_PAT`). All methods require a valid PAT or session API key.
 *
 * WasenderAPI docs: https://wasenderapi.com/api-docs
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";

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
    msgId?: string;
    [key: string]: unknown;
  };
}

export interface WasenderNumberCheckResult {
  exists: boolean;
  jid?: string;
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
        baseUrl: (row.base_url || "https://app.wasenderapi.com").replace(/\/+$/, ""),
      };
    }
  } catch {
    // DB unavailable — fall through to env
  }

  if (envPat) {
    return {
      pat: envPat,
      baseUrl: (process.env.WASENDER_BASE_URL || "https://app.wasenderapi.com").replace(/\/+$/, ""),
    };
  }

  return null;
}

/**
 * Fetch the session-specific API key stored in our DB.
 * WasenderAPI per-session calls use the session's own bearer token (API key),
 * while account-level calls (list/create sessions) use the PAT.
 */
async function getSessionApiKey(sessionId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("whatsapp_sessions")
    .select("wasender_session_id")
    .eq("id", sessionId)
    .maybeSingle();
  return (data as { wasender_session_id?: string } | null)?.wasender_session_id ?? null;
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
    isSessionKey?: boolean;
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
  const res = await wasenderFetch<WasenderSession[]>(
    config.baseUrl,
    "/api/whatsapp-sessions",
    config.pat,
  );
  if (!res.ok) throw new Error(`Failed to list sessions: ${res.status}`);
  return Array.isArray(res.data) ? res.data : [];
}

/** Create a new WhatsApp session. */
export async function createSession(
  config: WasenderConfig,
  name: string,
): Promise<WasenderSession> {
  const res = await wasenderFetch<{ data?: WasenderSession }>(
    config.baseUrl,
    "/api/whatsapp-sessions",
    config.pat,
    { method: "POST", body: { name } },
  );
  if (!res.ok) throw new Error(`Failed to create session: ${res.status}`);
  return (res.data as any)?.data ?? res.data;
}

/** Get session details. */
export async function getSessionDetails(
  config: WasenderConfig,
  wasenderSessionId: string,
): Promise<Record<string, unknown>> {
  const res = await wasenderFetch<Record<string, unknown>>(
    config.baseUrl,
    `/api/whatsapp-sessions/${wasenderSessionId}`,
    config.pat,
  );
  if (!res.ok) throw new Error(`Failed to get session: ${res.status}`);
  return res.data;
}

/** Delete a session. */
export async function deleteSession(
  config: WasenderConfig,
  wasenderSessionId: string,
): Promise<void> {
  const res = await wasenderFetch(
    config.baseUrl,
    `/api/whatsapp-sessions/${wasenderSessionId}`,
    config.pat,
    { method: "DELETE" },
  );
  if (!res.ok) throw new Error(`Failed to delete session: ${res.status}`);
}

// ---------------------------------------------------------------------------
// Session-level operations (session API key auth)
// ---------------------------------------------------------------------------

/** Connect (initiate) a session — triggers QR generation. */
export async function connectSession(
  config: WasenderConfig,
  wasenderSessionId: string,
): Promise<Record<string, unknown>> {
  const res = await wasenderFetch<Record<string, unknown>>(
    config.baseUrl,
    `/api/whatsapp-sessions/${wasenderSessionId}/connect`,
    config.pat,
    { method: "POST" },
  );
  if (!res.ok) throw new Error(`Failed to connect session: ${res.status}`);
  return res.data;
}

/** Get QR code for session linking. */
export async function getSessionQrCode(
  config: WasenderConfig,
  wasenderSessionId: string,
): Promise<{ qrCode?: string; [key: string]: unknown }> {
  const res = await wasenderFetch<{ qrCode?: string; qr_code?: string }>(
    config.baseUrl,
    `/api/whatsapp-sessions/${wasenderSessionId}/qrcode`,
    config.pat,
  );
  if (!res.ok) throw new Error(`Failed to get QR code: ${res.status}`);
  return res.data;
}

/** Get session connection status. */
export async function getSessionStatus(
  baseUrl: string,
  sessionApiKey: string,
): Promise<WasenderSessionStatus> {
  const res = await wasenderFetch<WasenderSessionStatus>(
    baseUrl,
    "/api/status",
    sessionApiKey,
    { isSessionKey: true },
  );
  if (!res.ok) throw new Error(`Failed to get status: ${res.status}`);
  return res.data;
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

/** Send a text message via a connected session. */
export async function sendTextMessage(
  baseUrl: string,
  sessionApiKey: string,
  to: string,
  text: string,
): Promise<WasenderSendResult> {
  const res = await wasenderFetch<WasenderSendResult>(
    baseUrl,
    "/api/send-message",
    sessionApiKey,
    {
      method: "POST",
      body: { to, type: "text", text },
      isSessionKey: true,
    },
  );
  return {
    success: res.ok,
    message: (res.data as any)?.message,
    data: res.ok ? (res.data as any)?.data ?? res.data : undefined,
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
  const res = await wasenderFetch<{ exists?: boolean; data?: { exists?: boolean; jid?: string } }>(
    baseUrl,
    `/api/on-whatsapp/${encodeURIComponent(cleaned)}`,
    sessionApiKey,
    { isSessionKey: true },
  );
  if (!res.ok) throw new Error(`Number check failed: ${res.status}`);
  const d = (res.data as any)?.data ?? res.data;
  return {
    exists: Boolean(d?.exists ?? d?.result),
    jid: d?.jid ?? d?.number,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve template placeholders with lead data. */
export function resolveTemplatePlaceholders(
  template: string,
  lead: Record<string, unknown>,
): string {
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
  };

  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    return vars[key.toLowerCase()] ?? `{{${key}}}`;
  });
}

/** Normalize a phone number to E.164-like format for WasenderAPI. */
export function normalizePhoneForWasender(phone: string): string {
  return phone.replace(/[\s\-().]/g, "").replace(/^00/, "+");
}
