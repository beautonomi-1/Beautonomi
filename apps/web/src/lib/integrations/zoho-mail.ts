import type { SupabaseClient } from "@supabase/supabase-js";

/** Official Zoho Mail API base URIs (getting started). */
export const ZOHO_MAIL_DATA_CENTERS = {
  US: "https://mail.zoho.com",
  EU: "https://mail.zoho.eu",
  IN: "https://mail.zoho.in",
  AU: "https://mail.zoho.com.au",
  JP: "https://mail.zoho.jp",
  CA: "https://mail.zohocloud.ca",
  CN: "https://mail.zoho.com.cn",
  AE: "https://mail.zoho.ae",
  SA: "https://mail.zoho.sa",
} as const;

export type ZohoMailDataCenter = (typeof ZOHO_MAIL_DATA_CENTERS)[keyof typeof ZOHO_MAIL_DATA_CENTERS];

export function accountsHostForMailBase(mailBase: string): string {
  if (mailBase === ZOHO_MAIL_DATA_CENTERS.CA) {
    return "https://accounts.zohocloud.ca";
  }
  const host = mailBase.replace(/^https:\/\//, "");
  const tld = host.replace(/^mail\.zoho\.?/, "").replace(/^mail\.zohocloud\./, "");
  if (host.includes("zohocloud.ca")) {
    return "https://accounts.zohocloud.ca";
  }
  if (tld === "com" || tld === "") {
    return "https://accounts.zoho.com";
  }
  return `https://accounts.zoho.${tld}`;
}

export type ZohoConnectionRow = {
  id: string;
  data_center: string;
  enabled: boolean;
  auth_status: "ok" | "revoked";
  poll_page_cap: number;
  max_messages_per_run: number;
  html_retention_days: number;
  client_id: string | null;
  client_secret: string | null;
  refresh_token: string | null;
  access_token: string | null;
  access_token_expires_at: string | null;
  zoho_account_id: string | null;
  last_error: string | null;
};

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
};

export class ZohoMailApiError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly httpStatus?: number,
    public readonly isThrottle?: boolean,
    public readonly isRevoked?: boolean,
  ) {
    super(message);
    this.name = "ZohoMailApiError";
  }
}

function isTokenRevokedError(body: TokenResponse): boolean {
  const err = String(body.error ?? "").toLowerCase();
  return err === "invalid_code" || err === "invalid_grant";
}

function isTokenThrottle(body: TokenResponse | Record<string, unknown>): boolean {
  const err = String((body as TokenResponse).error ?? body.error ?? "").toLowerCase();
  return err.includes("access denied");
}

export async function refreshZohoAccessToken(
  connection: Pick<ZohoConnectionRow, "data_center" | "client_id" | "client_secret" | "refresh_token">,
): Promise<{ access_token: string; expires_at: string }> {
  const accounts = accountsHostForMailBase(connection.data_center);
  const params = new URLSearchParams({
    refresh_token: connection.refresh_token ?? "",
    client_id: connection.client_id ?? "",
    client_secret: connection.client_secret ?? "",
    grant_type: "refresh_token",
  });
  const res = await fetch(`${accounts}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const body = (await res.json()) as TokenResponse;
  if (!res.ok || !body.access_token) {
    if (isTokenRevokedError(body)) {
      throw new ZohoMailApiError("Zoho refresh token revoked", body.error, res.status, false, true);
    }
    if (isTokenThrottle(body)) {
      throw new ZohoMailApiError("Zoho token throttle", body.error, res.status, true, false);
    }
    throw new ZohoMailApiError(body.error ?? "Token refresh failed", body.error, res.status);
  }
  const expiresIn = body.expires_in ?? 3600;
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  return { access_token: body.access_token, expires_at: expiresAt };
}

export async function exchangeZohoGrantCode(
  connection: Pick<ZohoConnectionRow, "data_center" | "client_id" | "client_secret">,
  grantCode: string,
): Promise<{ refresh_token: string; access_token: string; expires_at: string }> {
  const accounts = accountsHostForMailBase(connection.data_center);
  const params = new URLSearchParams({
    code: grantCode,
    client_id: connection.client_id ?? "",
    client_secret: connection.client_secret ?? "",
    grant_type: "authorization_code",
  });
  const res = await fetch(`${accounts}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const body = (await res.json()) as TokenResponse & { refresh_token?: string };
  if (!res.ok || !body.access_token || !body.refresh_token) {
    if (isTokenRevokedError(body)) {
      throw new ZohoMailApiError("Invalid grant code", body.error, res.status, false, true);
    }
    throw new ZohoMailApiError(body.error ?? "Grant exchange failed", body.error, res.status);
  }
  const expiresIn = body.expires_in ?? 3600;
  return {
    refresh_token: body.refresh_token,
    access_token: body.access_token,
    expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
  };
}

/** Row lock + cached token refresh (shared by cron, webhook, outbound). */
export async function getZohoAccessTokenForConnection(
  supabase: SupabaseClient,
  connectionId: string,
): Promise<{ token: string; connection: ZohoConnectionRow }> {
  const { data: row, error } = await supabase
    .from("support_zoho_connections")
    .select("*")
    .eq("id", connectionId)
    .maybeSingle();
  if (error) throw error;
  if (!row) {
    throw new ZohoMailApiError("Connection not found");
  }
  const connection = row as ZohoConnectionRow;
  if (connection.auth_status === "revoked" || !connection.refresh_token?.trim()) {
    throw new ZohoMailApiError("Connection auth revoked or missing refresh token", undefined, undefined, false, true);
  }

  const expiresAt = connection.access_token_expires_at
    ? new Date(connection.access_token_expires_at).getTime()
    : 0;
  const needsRefresh = !connection.access_token || expiresAt - Date.now() < 60_000;

  if (!needsRefresh && connection.access_token) {
    return { token: connection.access_token, connection };
  }

  const { error: lockErr } = await supabase.rpc("with_zoho_connection_lock", {
    p_connection_id: connectionId,
  });
  if (lockErr) {
    throw lockErr;
  }

  const { data: lockedRow, error: refetchErr } = await supabase
    .from("support_zoho_connections")
    .select("*")
    .eq("id", connectionId)
    .maybeSingle();
  if (refetchErr) throw refetchErr;
  if (!lockedRow) {
    throw new ZohoMailApiError("Connection not found");
  }
  const locked = lockedRow as ZohoConnectionRow;
  const lockedExpires = locked.access_token_expires_at
    ? new Date(locked.access_token_expires_at).getTime()
    : 0;
  const stillNeedsRefresh = !locked.access_token || lockedExpires - Date.now() < 60_000;
  if (!stillNeedsRefresh && locked.access_token) {
    return { token: locked.access_token, connection: locked };
  }

  try {
    const refreshed = await refreshZohoAccessToken(locked);
    await supabase
      .from("support_zoho_connections")
      .update({
        access_token: refreshed.access_token,
        access_token_expires_at: refreshed.expires_at,
        auth_status: "ok",
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", connectionId);
    return { token: refreshed.access_token, connection: { ...locked, access_token: refreshed.access_token } };
  } catch (err) {
    if (err instanceof ZohoMailApiError && err.isRevoked) {
      await supabase
        .from("support_zoho_connections")
        .update({
          auth_status: "revoked",
          last_error: err.message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", connectionId);
      try {
        const { writeAuditLog } = await import("@/lib/audit/audit");
        await writeAuditLog({
          actor_user_id: null,
          actor_role: "system",
          action: "admin.integrations.zoho_connection.revoked",
          entity_type: "support_zoho_connections",
          entity_id: connectionId,
          module: "integrations",
          risk_level: "high",
          retention_tier: "access",
          metadata: { reason: err.message },
        });
      } catch {
        /* best-effort */
      }
    } else if (err instanceof ZohoMailApiError && err.isThrottle && connection.access_token) {
      return { token: connection.access_token, connection };
    }
    throw err;
  }
}

async function zohoFetch(
  mailBase: string,
  token: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const url = `${mailBase}${path.startsWith("/") ? path : `/${path}`}`;
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      ...(init?.headers ?? {}),
    },
  });
}

export type ZohoApiJson = {
  status?: { code?: number; description?: string };
  data?: unknown;
};

export async function zohoMailJson<T = ZohoApiJson>(
  mailBase: string,
  token: string,
  path: string,
  init?: RequestInit,
  retryOn401 = true,
  refresh?: () => Promise<string>,
): Promise<T> {
  let res = await zohoFetch(mailBase, token, path, init);
  if (res.status === 401 && retryOn401 && refresh) {
    const newToken = await refresh();
    res = await zohoFetch(mailBase, newToken, path, init);
  }
  const json = (await res.json()) as T & ZohoApiJson;
  const code = (json as ZohoApiJson).status?.code;
  if (!res.ok || (code != null && code !== 200)) {
    const desc = (json as ZohoApiJson).status?.description ?? res.statusText;
    const throttle = /rate|limit|denied/i.test(desc);
    throw new ZohoMailApiError(desc || "Zoho Mail API error", String(code), res.status, throttle);
  }
  return json;
}

export type ZohoAccount = {
  accountId: string;
  sendMailDetails?: { fromAddress?: string }[];
};

export async function listZohoAccounts(mailBase: string, token: string): Promise<ZohoAccount[]> {
  const json = await zohoMailJson<{ data?: ZohoAccount[] }>(mailBase, token, "/api/accounts");
  return json.data ?? [];
}

export function matchAccountForMailbox(accounts: ZohoAccount[], address: string): ZohoAccount | null {
  const normalized = address.trim().toLowerCase();
  for (const acc of accounts) {
    const details = acc.sendMailDetails ?? [];
    if (details.some((d) => String(d.fromAddress ?? "").trim().toLowerCase() === normalized)) {
      return acc;
    }
  }
  return null;
}

export type ZohoFolder = { folderId: string; folderName?: string; folderType?: string };

export async function listZohoFolders(
  mailBase: string,
  token: string,
  accountId: string,
): Promise<ZohoFolder[]> {
  const json = await zohoMailJson<{ data?: ZohoFolder[] }>(
    mailBase,
    token,
    `/api/accounts/${accountId}/folders`,
  );
  return json.data ?? [];
}

export function resolveInboxFolderId(folders: ZohoFolder[], overrideId?: string | null): string | null {
  if (overrideId?.trim()) return overrideId.trim();
  const inbox = folders.find((f) => String(f.folderType ?? "").toLowerCase() === "inbox");
  return inbox?.folderId ?? null;
}

export type ZohoMessageListRow = {
  messageId?: string;
  threadId?: string;
  receivedTime?: string;
  hasAttachment?: string | number;
  fromAddress?: string;
  toAddress?: string;
  ccAddress?: string;
  subject?: string;
};

export async function listZohoMessages(
  mailBase: string,
  token: string,
  accountId: string,
  params: { folderId: string; start: number; limit: number },
): Promise<ZohoMessageListRow[]> {
  const qs = new URLSearchParams({
    folderId: params.folderId,
    start: String(params.start),
    limit: String(Math.min(params.limit, 200)),
    sortBy: "date",
    sortorder: "false",
    includesent: "false",
  });
  const json = await zohoMailJson<{ data?: ZohoMessageListRow[] }>(
    mailBase,
    token,
    `/api/accounts/${accountId}/messages/view?${qs.toString()}`,
  );
  return json.data ?? [];
}

export async function getZohoMessageContent(
  mailBase: string,
  token: string,
  accountId: string,
  folderId: string,
  messageId: string,
): Promise<{ content?: string; textContent?: string }> {
  const json = await zohoMailJson<{ data?: { content?: string; textContent?: string } }>(
    mailBase,
    token,
    `/api/accounts/${accountId}/folders/${folderId}/messages/${messageId}/content?includeBlockContent=true`,
  );
  return json.data ?? {};
}

export type ZohoMessageAttachmentInfo = {
  attachmentId: string;
  attachmentName: string;
  attachmentSize: number;
};

export function zohoListRowHasAttachment(row: Pick<ZohoMessageListRow, "hasAttachment">): boolean {
  const v = row.hasAttachment;
  if (v === undefined || v === null || v === "") return false;
  if (typeof v === "number") return v > 0;
  const s = String(v).toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

/** Non-inline file attachments only (Zoho attachmentinfo API). */
export async function listZohoMessageAttachments(
  mailBase: string,
  token: string,
  accountId: string,
  folderId: string,
  messageId: string,
): Promise<ZohoMessageAttachmentInfo[]> {
  const json = await zohoMailJson<{
    data?: {
      attachments?: Array<{
        attachmentId?: string | number;
        attachmentName?: string;
        attachmentSize?: number;
      }>;
    };
  }>(
    mailBase,
    token,
    `/api/accounts/${accountId}/folders/${folderId}/messages/${messageId}/attachmentinfo?includeInline=false`,
  );
  const raw = json.data?.attachments ?? [];
  return raw
    .map((a) => ({
      attachmentId: String(a.attachmentId ?? "").trim(),
      attachmentName: String(a.attachmentName ?? "attachment").trim() || "attachment",
      attachmentSize: Number(a.attachmentSize ?? 0) || 0,
    }))
    .filter((a) => a.attachmentId.length > 0);
}

export async function downloadZohoMessageAttachment(
  mailBase: string,
  token: string,
  accountId: string,
  folderId: string,
  messageId: string,
  attachmentId: string,
): Promise<ArrayBuffer> {
  const path = `/api/accounts/${accountId}/folders/${folderId}/messages/${messageId}/attachments/${attachmentId}`;
  const url = `${mailBase}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      Accept: "application/octet-stream",
    },
  });
  if (!res.ok) {
    const throttle = res.status === 429 || /rate|limit|denied/i.test(res.statusText);
    throw new ZohoMailApiError(
      `Zoho attachment download failed (${res.status})`,
      String(res.status),
      res.status,
      throttle,
    );
  }
  return res.arrayBuffer();
}

export function parseZohoHeaderContent(headerContent: unknown): Record<string, string[]> {
  if (headerContent == null) return {};
  if (typeof headerContent === "string") {
    const map: Record<string, string[]> = {};
    for (const line of headerContent.split(/\r?\n/)) {
      const idx = line.indexOf(":");
      if (idx <= 0) continue;
      const name = line.slice(0, idx).trim().toLowerCase();
      const val = line.slice(idx + 1).trim();
      if (!map[name]) map[name] = [];
      map[name].push(val);
    }
    return map;
  }
  if (typeof headerContent === "object") {
    const raw = headerContent as Record<string, string | string[]>;
    const map: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(raw)) {
      map[k.toLowerCase()] = Array.isArray(v) ? v : [v];
    }
    return map;
  }
  return {};
}

export async function getZohoMessageHeaders(
  mailBase: string,
  token: string,
  accountId: string,
  folderId: string,
  messageId: string,
): Promise<Record<string, string[]>> {
  const json = await zohoMailJson<{ data?: { headerContent?: unknown } }>(
    mailBase,
    token,
    `/api/accounts/${accountId}/folders/${folderId}/messages/${messageId}/header`,
  );
  return parseZohoHeaderContent(json.data?.headerContent);
}

/** Parse display-name forms: `"Name" <a@b.com>` or plain email. */
export function parseEmailAddress(raw: string | null | undefined): string {
  if (!raw || raw === "Not Provided") return "";
  const trimmed = raw.trim();
  const angle = trimmed.match(/<([^>]+)>/);
  if (angle?.[1]) return angle[1].trim().toLowerCase();
  if (trimmed.includes("@")) return trimmed.toLowerCase();
  return trimmed.toLowerCase();
}

export function parseAddressList(raw: string | null | undefined): string[] {
  if (!raw || raw === "Not Provided") return [];
  return raw
    .split(",")
    .map((p) => parseEmailAddress(p))
    .filter(Boolean);
}

export function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

/** Strip quoted reply block (simple heuristic). */
export function extractNewReplyPlainText(full: string): string {
  const lines = full.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    if (/^On .+ wrote:$/i.test(line.trim())) break;
    if (/^-{2,}\s*Original Message/i.test(line)) break;
    if (/^From:/i.test(line.trim()) && out.length > 2) break;
    out.push(line);
  }
  return out.join("\n").trim();
}

export async function zohoReplyToMessage(
  mailBase: string,
  token: string,
  accountId: string,
  messageId: string,
  body: {
    fromAddress: string;
    toAddress: string;
    ccAddress?: string;
    content: string;
    mailFormat?: "html" | "plaintext";
  },
): Promise<ZohoApiJson> {
  const payload: Record<string, unknown> = {
    fromAddress: body.fromAddress,
    toAddress: body.toAddress,
    content: body.content,
    mailFormat: body.mailFormat ?? "html",
    action: "reply",
  };
  if (body.ccAddress?.trim()) {
    payload.ccAddress = body.ccAddress;
  }
  return zohoMailJson(
    mailBase,
    token,
    `/api/accounts/${accountId}/messages/${messageId}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
}

export async function zohoSendNewMessage(
  mailBase: string,
  token: string,
  accountId: string,
  body: {
    fromAddress: string;
    toAddress: string;
    subject: string;
    content: string;
    mailFormat?: "html" | "plaintext";
  },
): Promise<ZohoApiJson> {
  return zohoMailJson(mailBase, token, `/api/accounts/${accountId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fromAddress: body.fromAddress,
      toAddress: body.toAddress,
      subject: body.subject,
      content: body.content,
      mailFormat: body.mailFormat ?? "html",
    }),
  });
}

export function isAutoReplyHeaders(headers: Record<string, string[]>): boolean {
  const auto = (headers["auto-submitted"] ?? []).join(" ").toLowerCase();
  if (auto.includes("auto-replied") || auto.includes("auto-generated")) return true;
  const prec = (headers["precedence"] ?? []).join(" ").toLowerCase();
  if (prec === "bulk" || prec === "junk") return true;
  return false;
}

export function isAutoReplyFallback(from: string, subject: string): boolean {
  const f = from.toLowerCase();
  const s = subject.toLowerCase();
  if (f.includes("mailer-daemon") || f.includes("postmaster")) return true;
  if (s.includes("automatic reply") || s.includes("out of office") || s.includes("undeliverable")) {
    return true;
  }
  return false;
}

const TKT_RE = /TKT-\d{8}-\d{6}/i;

export function extractTicketNumberFromSubject(subject: string): string | null {
  const m = subject.match(TKT_RE);
  return m ? m[0].toUpperCase() : null;
}

export function firstHeaderValue(headers: Record<string, string[]>, name: string): string {
  return (headers[name.toLowerCase()] ?? [])[0] ?? "";
}

export function rfcIdsFromHeaders(headers: Record<string, string[]>): string[] {
  const ids: string[] = [];
  const inReply = firstHeaderValue(headers, "in-reply-to");
  const refs = firstHeaderValue(headers, "references");
  const msgId = firstHeaderValue(headers, "message-id");
  if (inReply) ids.push(inReply.trim());
  if (refs) {
    for (const part of refs.split(/\s+/)) {
      if (part.trim()) ids.push(part.trim());
    }
  }
  if (msgId) ids.push(msgId.trim());
  return ids;
}
