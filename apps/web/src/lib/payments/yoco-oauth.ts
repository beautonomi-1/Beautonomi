/**
 * Yoco OAuth 2.0 helpers.
 *
 * Yoco's first-party API (api.yoco.com) authenticates via OAuth-issued JWT
 * access tokens — NOT the long-lived `sk_*` secret key on the dashboard. This
 * module owns:
 *
 *   - resolveOauthApp:        which client_id / client_secret to use for a
 *                             given tenant+environment (per-tenant override,
 *                             platform-wide row, env-var fallback).
 *   - buildAuthorizeUrl:      construct the iam.yoco.com /oauth2/authorize URL.
 *   - exchangeCodeForToken:   `authorization_code` grant.
 *   - refreshAccessToken:     `refresh_token` grant.
 *   - getValidAccessToken:    central call site for the rest of the codebase:
 *                             returns a Bearer string that is fresh, refreshing
 *                             via the refresh_token if needed. Throws
 *                             YocoOAuthRequired when no token / refresh failed.
 *   - verifyTokenInfo:        sanity-check a token against api.yoco.com.
 *
 * Token lifetimes (from Yoco docs):
 *   - access_token  ≈ 14 days
 *   - refresh_token ≈ 60 days
 *   We refresh when the access_token is within 5 minutes of expiry so the
 *   request that triggered the call still succeeds with the new token.
 */

import crypto from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  type YocoEnvironment,
  getDefaultYocoEnvironment,
  getYocoBases,
  getYocoEndpoints,
} from "./yoco";

/** Window (ms) before `expires_at` at which we proactively refresh. */
const REFRESH_LEAD_MS = 5 * 60 * 1000;

/** Default scopes; can be overridden per tenant via tenant_yoco_oauth_apps.default_scopes. */
export const DEFAULT_YOCO_SCOPES = [
  "openid",
  "offline_access",
  "business/webpos:read",
  "business/webpos:write",
  "business/payments:read",
  "business/payments:write",
  "business/webhooks:write",
  "business/refunds:read",
  "business/refunds:write",
  "business/orders:read",
  "business/payouts:read",
].join(" ");

export interface ResolvedYocoOauthApp {
  source: "tenant" | "global" | "env";
  tenantId: string | null;
  environment: YocoEnvironment;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  defaultScopes: string;
}

export interface YocoTokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  scope?: string;
  id_token?: string;
}

export interface YocoOauthTokenRow {
  provider_id: string;
  tenant_id: string | null;
  environment: YocoEnvironment;
  access_token: string;
  refresh_token: string | null;
  token_type: string;
  scope: string | null;
  expires_at: string;
  refresh_expires_at: string | null;
  business_id: string | null;
  business_name: string | null;
  user_email: string | null;
  last_refreshed_at: string | null;
  last_refresh_error: string | null;
}

/**
 * Thrown when a route tries to call api.yoco.com on behalf of a provider that
 * has no usable OAuth token. Callers should translate this into an HTTP 400
 * with code `YOCO_OAUTH_REQUIRED` so the UI can prompt for reconnect.
 */
export class YocoOAuthRequired extends Error {
  code: "YOCO_OAUTH_REQUIRED" | "YOCO_OAUTH_EXPIRED" | "YOCO_OAUTH_APP_NOT_CONFIGURED";
  constructor(message: string, code: YocoOAuthRequired["code"] = "YOCO_OAUTH_REQUIRED") {
    super(message);
    this.name = "YocoOAuthRequired";
    this.code = code;
  }
}

type SupabaseLike = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (column: string, value: unknown) => any;
      is?: (column: string, value: unknown) => any;
      order?: any;
      limit?: any;
      maybeSingle?: any;
    };
  };
};

/**
 * Look up the Yoco OAuth client_id/client_secret to use for this tenant+env.
 *
 * Resolution order (highest priority first):
 *   1. `tenant_yoco_oauth_apps` row with matching tenant_id + environment
 *      (white-label override).
 *   2. `tenant_yoco_oauth_apps` row with tenant_id IS NULL + environment
 *      (platform default stored in DB).
 *   3. Env vars: `YOCO_OAUTH_CLIENT_ID(_SANDBOX)` /
 *      `YOCO_OAUTH_CLIENT_SECRET(_SANDBOX)` /
 *      `YOCO_OAUTH_REDIRECT_URI(_SANDBOX)`.
 */
export async function resolveOauthApp(
  tenantId: string | null,
  environment: YocoEnvironment,
  supabase?: SupabaseLike
): Promise<ResolvedYocoOauthApp> {
  const db = (supabase ?? getSupabaseAdmin()) as any;

  if (tenantId) {
    const { data: tenantRow } = await db
      .from("tenant_yoco_oauth_apps")
      .select("client_id, client_secret, redirect_uri, default_scopes, is_enabled")
      .eq("tenant_id", tenantId)
      .eq("environment", environment)
      .eq("is_enabled", true)
      .maybeSingle();

    if (tenantRow?.client_id && tenantRow?.client_secret && tenantRow?.redirect_uri) {
      return {
        source: "tenant",
        tenantId,
        environment,
        clientId: String(tenantRow.client_id),
        clientSecret: String(tenantRow.client_secret),
        redirectUri: String(tenantRow.redirect_uri),
        defaultScopes: String(tenantRow.default_scopes || DEFAULT_YOCO_SCOPES),
      };
    }
  }

  const { data: globalRow } = await db
    .from("tenant_yoco_oauth_apps")
    .select("client_id, client_secret, redirect_uri, default_scopes, is_enabled")
    .is("tenant_id", null)
    .eq("environment", environment)
    .eq("is_enabled", true)
    .maybeSingle();

  if (globalRow?.client_id && globalRow?.client_secret && globalRow?.redirect_uri) {
    return {
      source: "global",
      tenantId: null,
      environment,
      clientId: String(globalRow.client_id),
      clientSecret: String(globalRow.client_secret),
      redirectUri: String(globalRow.redirect_uri),
      defaultScopes: String(globalRow.default_scopes || DEFAULT_YOCO_SCOPES),
    };
  }

  const suffix = environment === "sandbox" ? "_SANDBOX" : "";
  const clientId = process.env[`YOCO_OAUTH_CLIENT_ID${suffix}`];
  const clientSecret = process.env[`YOCO_OAUTH_CLIENT_SECRET${suffix}`];
  const redirectUri = process.env[`YOCO_OAUTH_REDIRECT_URI${suffix}`];

  if (!clientId || !clientSecret || !redirectUri) {
    throw new YocoOAuthRequired(
      `Yoco OAuth app is not configured for environment "${environment}". ` +
        `Add a row to tenant_yoco_oauth_apps or set ` +
        `YOCO_OAUTH_CLIENT_ID${suffix} / YOCO_OAUTH_CLIENT_SECRET${suffix} / ` +
        `YOCO_OAUTH_REDIRECT_URI${suffix}.`,
      "YOCO_OAUTH_APP_NOT_CONFIGURED"
    );
  }

  return {
    source: "env",
    tenantId: null,
    environment,
    clientId,
    clientSecret,
    redirectUri,
    defaultScopes: process.env[`YOCO_OAUTH_SCOPES${suffix}`] ?? DEFAULT_YOCO_SCOPES,
  };
}

export interface BuildAuthorizeUrlOptions {
  app: ResolvedYocoOauthApp;
  state: string;
  scopes?: string;
  /** Optional override for the redirect_uri sent to Yoco. */
  redirectUri?: string;
}

/**
 * Construct the iam.yoco.com /oauth2/authorize URL that the provider browser
 * is redirected to. The `state` value must round-trip back to /callback for
 * CSRF protection.
 */
export function buildAuthorizeUrl(opts: BuildAuthorizeUrlOptions): string {
  const endpoints = getYocoEndpoints(opts.app.environment);
  const params = new URLSearchParams({
    response_type: "code",
    client_id: opts.app.clientId,
    redirect_uri: opts.redirectUri ?? opts.app.redirectUri,
    scope: opts.scopes ?? opts.app.defaultScopes,
    state: opts.state,
  });
  return `${endpoints.authorize}?${params.toString()}`;
}

/** Generate a cryptographically random state token for the OAuth handshake. */
export function generateState(): string {
  return crypto.randomBytes(32).toString("base64url");
}

async function postFormEncoded(
  url: string,
  body: Record<string, string>
): Promise<{ status: number; json: any }> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams(body).toString(),
  });
  const text = await res.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { error: "invalid_response", error_description: text };
  }
  return { status: res.status, json };
}

export interface ExchangeCodeOptions {
  code: string;
  app: ResolvedYocoOauthApp;
  /** Must match the redirect_uri sent on /authorize. */
  redirectUri?: string;
}

/**
 * Exchange an authorization code for an access + refresh token pair.
 * Yoco's /oauth2/token requires `application/x-www-form-urlencoded`.
 */
export async function exchangeCodeForToken(opts: ExchangeCodeOptions): Promise<YocoTokenResponse> {
  const endpoints = getYocoEndpoints(opts.app.environment);
  const { status, json } = await postFormEncoded(endpoints.token, {
    grant_type: "authorization_code",
    code: opts.code,
    redirect_uri: opts.redirectUri ?? opts.app.redirectUri,
    client_id: opts.app.clientId,
    client_secret: opts.app.clientSecret,
  });
  if (status < 200 || status >= 300 || !json?.access_token) {
    const desc = json?.error_description || json?.error || `HTTP ${status}`;
    throw new YocoOAuthRequired(`Yoco token exchange failed: ${desc}`, "YOCO_OAUTH_REQUIRED");
  }
  return json as YocoTokenResponse;
}

export interface RefreshTokenOptions {
  refreshToken: string;
  app: ResolvedYocoOauthApp;
}

export async function refreshAccessToken(opts: RefreshTokenOptions): Promise<YocoTokenResponse> {
  const endpoints = getYocoEndpoints(opts.app.environment);
  const { status, json } = await postFormEncoded(endpoints.token, {
    grant_type: "refresh_token",
    refresh_token: opts.refreshToken,
    client_id: opts.app.clientId,
    client_secret: opts.app.clientSecret,
  });
  if (status < 200 || status >= 300 || !json?.access_token) {
    const desc = json?.error_description || json?.error || `HTTP ${status}`;
    throw new YocoOAuthRequired(`Yoco token refresh failed: ${desc}`, "YOCO_OAUTH_EXPIRED");
  }
  return json as YocoTokenResponse;
}

/**
 * Decode an id_token JWT body (NO signature verification — Yoco docs note the
 * JWKS at /.well-known/jwks.json; we use this purely to surface user-friendly
 * business name/email after the callback). Returns an empty object on parse
 * failure so callers can safely spread.
 */
export function decodeIdTokenPayload(idToken: string | undefined): {
  sub?: string;
  user_id?: string;
  user_name?: string;
  user_email?: string;
  default_business_id?: string;
  authorized_business_id?: string;
  business_ids?: string[];
} {
  if (!idToken) return {};
  const parts = idToken.split(".");
  if (parts.length !== 3) return {};
  try {
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    const json = Buffer.from(padded, "base64").toString("utf8");
    return JSON.parse(json) ?? {};
  } catch {
    return {};
  }
}

/**
 * Compute the `expires_at` ISO timestamp for a token response. Yoco returns
 * `expires_in` as seconds.
 */
export function computeExpiresAt(expiresInSec: number, now: Date = new Date()): string {
  return new Date(now.getTime() + Math.max(0, expiresInSec) * 1000).toISOString();
}

/**
 * Persist (insert or update) the OAuth tokens for a provider.
 *
 * Uses the service-role client because the OAuth callback runs without the
 * provider's Supabase session and the RLS policies on
 * `provider_yoco_oauth_tokens` are deliberately strict.
 */
export async function upsertProviderTokens(args: {
  providerId: string;
  tenantId: string | null;
  environment: YocoEnvironment;
  token: YocoTokenResponse;
  refreshExpiresInSec?: number;
}): Promise<YocoOauthTokenRow> {
  const supabase = getSupabaseAdmin();
  const now = new Date();
  const claims = decodeIdTokenPayload(args.token.id_token);
  const expiresAt = computeExpiresAt(args.token.expires_in, now);
  const refreshExpiresAt =
    args.token.refresh_token && args.refreshExpiresInSec
      ? computeExpiresAt(args.refreshExpiresInSec, now)
      : args.token.refresh_token
        ? // Yoco docs: refresh tokens last ~60 days.
          computeExpiresAt(60 * 24 * 60 * 60, now)
        : null;

  const row: Record<string, unknown> = {
    provider_id: args.providerId,
    tenant_id: args.tenantId,
    environment: args.environment,
    access_token: args.token.access_token,
    refresh_token: args.token.refresh_token ?? null,
    token_type: args.token.token_type || "bearer",
    scope: args.token.scope ?? null,
    expires_at: expiresAt,
    refresh_expires_at: refreshExpiresAt,
    business_id: claims.authorized_business_id ?? claims.default_business_id ?? null,
    business_name: claims.user_name ?? null,
    user_email: claims.user_email ?? null,
    last_refreshed_at: now.toISOString(),
    last_refresh_error: null,
    updated_at: now.toISOString(),
  };

  const { data, error } = await (supabase.from("provider_yoco_oauth_tokens") as any)
    .upsert(row, { onConflict: "provider_id,environment" })
    .select()
    .single();

  if (error || !data) {
    throw new YocoOAuthRequired(
      `Could not store Yoco OAuth tokens: ${error?.message ?? "unknown error"}`,
      "YOCO_OAUTH_REQUIRED"
    );
  }

  return data as YocoOauthTokenRow;
}

/**
 * Load the provider's OAuth row (live or sandbox). Service role so route
 * handlers do not have to pass the user-scoped client.
 */
export async function loadProviderTokens(
  providerId: string,
  environment: YocoEnvironment
): Promise<YocoOauthTokenRow | null> {
  const supabase = getSupabaseAdmin();
  const { data } = await (supabase.from("provider_yoco_oauth_tokens") as any)
    .select("*")
    .eq("provider_id", providerId)
    .eq("environment", environment)
    .maybeSingle();
  return (data as YocoOauthTokenRow | null) ?? null;
}

/**
 * Central helper for every server route that calls api.yoco.com on behalf of
 * a provider. Returns a Bearer string that is guaranteed valid for at least
 * REFRESH_LEAD_MS more milliseconds, refreshing via refresh_token if needed.
 *
 * Throws `YocoOAuthRequired` so route handlers can map it to a clear,
 * actionable user-facing error.
 */
export async function getValidAccessToken(
  providerId: string,
  options: { environment?: YocoEnvironment; tenantId?: string | null } = {}
): Promise<string> {
  const env = options.environment ?? getDefaultYocoEnvironment();
  const row = await loadProviderTokens(providerId, env);
  if (!row?.access_token) {
    throw new YocoOAuthRequired(
      "This provider has not connected Yoco yet. Open Payment Settings and tap Connect Yoco.",
      "YOCO_OAUTH_REQUIRED"
    );
  }

  const expiresAtMs = Date.parse(row.expires_at);
  const stillFresh = Number.isFinite(expiresAtMs) && expiresAtMs - Date.now() > REFRESH_LEAD_MS;
  if (stillFresh) return row.access_token;

  if (!row.refresh_token) {
    throw new YocoOAuthRequired(
      "Your Yoco connection has expired and there is no refresh token. Please reconnect Yoco in Payment Settings.",
      "YOCO_OAUTH_EXPIRED"
    );
  }

  const app = await resolveOauthApp(options.tenantId ?? row.tenant_id ?? null, env);
  try {
    const refreshed = await refreshAccessToken({
      refreshToken: row.refresh_token,
      app,
    });
    const updated = await upsertProviderTokens({
      providerId,
      tenantId: row.tenant_id,
      environment: env,
      token: {
        // Yoco may rotate the refresh_token; keep the new one if present, else
        // reuse the existing refresh_token so we do not lose offline access.
        refresh_token: refreshed.refresh_token ?? row.refresh_token,
        ...refreshed,
      },
    });
    return updated.access_token;
  } catch (err) {
    // Persist the refresh error so the UI can surface "reconnect required".
    const supabase = getSupabaseAdmin();
    await (supabase.from("provider_yoco_oauth_tokens") as any)
      .update({
        last_refresh_error: err instanceof Error ? err.message : "Unknown refresh error",
        updated_at: new Date().toISOString(),
      })
      .eq("provider_id", providerId)
      .eq("environment", env);
    if (err instanceof YocoOAuthRequired) throw err;
    throw new YocoOAuthRequired(
      "Yoco refused the refresh token. Please reconnect Yoco in Payment Settings.",
      "YOCO_OAUTH_EXPIRED"
    );
  }
}

/**
 * Sanity check a token against api.yoco.com /v1/oauth2/token-info. Returns
 * `{ ok: true, info }` if the token is valid; otherwise `{ ok: false, status, body }`.
 */
export async function verifyTokenInfo(
  accessToken: string,
  environment: YocoEnvironment = getDefaultYocoEnvironment()
): Promise<
  { ok: true; info: Record<string, unknown> } | { ok: false; status: number; body: unknown }
> {
  const endpoints = getYocoEndpoints(environment);
  const res = await fetch(endpoints.tokenInfo, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = await res.json().catch(() => ({}));
  if (res.ok) return { ok: true, info: json as Record<string, unknown> };
  return { ok: false, status: res.status, body: json };
}

/**
 * Helper for routes that need to know what credential the provider has
 * available, without hitting Yoco. Returns the integration row's
 * credential_mode along with the resolved environment (so the caller can pick
 * the right host).
 */
export async function resolveProviderCredentialMode(providerId: string): Promise<{
  credentialMode: "none" | "checkout" | "oauth";
  environment: YocoEnvironment;
  isEnabled: boolean;
  hasSecretKey: boolean;
  hasOauthToken: boolean;
}> {
  const supabase = getSupabaseAdmin();
  const { data: integration } = await (supabase.from("provider_yoco_integrations") as any)
    .select("credential_mode, environment, is_enabled, secret_key")
    .eq("provider_id", providerId)
    .maybeSingle();

  const integrationRow =
    (integration as {
      credential_mode?: string;
      environment?: string;
      is_enabled?: boolean;
      secret_key?: string | null;
    } | null) ?? null;

  const env: YocoEnvironment = integrationRow?.environment === "sandbox" ? "sandbox" : "live";
  const oauthRow = await loadProviderTokens(providerId, env);

  const credentialMode: "none" | "checkout" | "oauth" = oauthRow?.access_token
    ? "oauth"
    : integrationRow?.secret_key && integrationRow.secret_key.trim().length > 0
      ? "checkout"
      : "none";

  return {
    credentialMode,
    environment: env,
    isEnabled: integrationRow?.is_enabled === true,
    hasSecretKey: !!integrationRow?.secret_key?.trim(),
    hasOauthToken: !!oauthRow?.access_token,
  };
}

/**
 * Look up a Bearer token to use for a Checkout-API call. The Checkout API uses
 * the dashboard secret_key (NOT the OAuth JWT).
 */
export async function getCheckoutBearer(providerId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data } = await (supabase.from("provider_yoco_integrations") as any)
    .select("secret_key")
    .eq("provider_id", providerId)
    .maybeSingle();
  const row = data as { secret_key?: string | null } | null;
  const key = row?.secret_key?.trim();
  return key && key.length > 0 ? key : null;
}

/** Re-export host bases for callers that build URLs themselves. */
export { getYocoBases, getYocoEndpoints } from "./yoco";
