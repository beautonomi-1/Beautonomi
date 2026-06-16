/**
 * API client for provider app - calls apps/web with Bearer token only (no cookies).
 * Session recovery: on 401, refresh and retry once; sign out only when session is invalid,
 * not on network errors, so the app won't randomly logout.
 */
import {
  createApiClient,
  type ApiClientExtraOptions,
  type ApiClientRequestBody,
  type RequestOptions,
} from "@beautonomi/api";
import type { ApiResponse } from "@beautonomi/types";
import { supabase } from "@/lib/supabase/client";
import { APP_URL, getBackendUrl, webApiTenantHeaders } from "@/config/public-env";
import { getDeviceRegionCountryIso } from "@/lib/device-default-country-dial";
import { authFlowBreadcrumb, captureError, isSentryEnabled } from "@/lib/sentry";
import { getHttpErrorStatus } from "@/lib/api-error";
import {
  activeProviderIdHeadersForPath,
  clearActiveProviderApiHintMemory,
} from "@/lib/active-provider-api-hint";

/** Resolve API base URL with strict production safeguards. Never throws — callers expect sync resolution inside apiFetch try/catch. */
export function getApiBaseUrl(): string {
  const resolved = getBackendUrl();
  if (resolved) {
    if (__DEV__ && !APP_URL?.trim()) {
      console.warn(
        `[API] EXPO_PUBLIC_APP_URL unset; using ${resolved}. Set apps/provider/.env.local for a fixed backend URL.`,
      );
    }
    return resolved;
  }
  if (!__DEV__) {
    console.error(
      "Missing EXPO_PUBLIC_APP_URL for provider API client. Configure apps/provider/.env.",
    );
  }
  return "";
}

/**
 * §Provider-audit 2026-04 (P1 PERF): previously every API call did
 * `supabase.auth.getUser()` — a NETWORK call to Supabase `/user` — on
 * top of `getSession()` + possibly `refreshSession()`. That made every
 * tap / screen transition feel sluggish because each API request paid
 * 1-2 extra round-trips just to authenticate.
 *
 * The new flow is fully local unless the token is actually expired and
 * dedupes concurrent callers so a screen doing 5 parallel fetches only
 * hits the auth subsystem once.
 */

const TOKEN_CACHE_TTL_MS = 30_000;
const REFRESH_LEEWAY_MS = 60_000;

type CachedToken = { token: string; expiresAtMs: number; fetchedAtMs: number };
let cachedToken: CachedToken | null = null;
let inflightToken: Promise<string | null> | null = null;

function clearCachedToken(): void {
  cachedToken = null;
}

/** Clear in-memory JWT cache (e.g. user tapped Log out). */
export function invalidateApiAccessTokenCache(): void {
  inflightToken = null;
  clearCachedToken();
  clearActiveProviderApiHintMemory();
}

async function resolveAccessToken(): Promise<string | null> {
  const now = Date.now();
  if (cachedToken && now - cachedToken.fetchedAtMs < TOKEN_CACHE_TTL_MS) {
    const timeLeft = cachedToken.expiresAtMs - now;
    if (timeLeft > REFRESH_LEEWAY_MS) {
      return cachedToken.token;
    }
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  let token = session?.access_token ?? null;
  const expiresAtSec = session?.expires_at ?? 0;
  let expiresAtMs = expiresAtSec * 1000;

  const needsRefresh =
    !token || (expiresAtMs > 0 && expiresAtMs - now <= REFRESH_LEEWAY_MS);

  if (needsRefresh) {
    if (isSentryEnabled()) {
      authFlowBreadcrumb("get_access_token", { step: "refreshSession_start" });
    }
    const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession();
    if (refreshErr) {
      if (isSentryEnabled()) {
        authFlowBreadcrumb("get_access_token", {
          step: "refreshSession_error",
          message: refreshErr.message,
        });
      }
      return null;
    }
    token = refreshed.session?.access_token ?? null;
    expiresAtMs = (refreshed.session?.expires_at ?? 0) * 1000;
  }

  if (token) {
    cachedToken = { token, expiresAtMs, fetchedAtMs: Date.now() };
  } else {
    cachedToken = null;
  }
  return token;
}

async function getAccessToken(): Promise<string | null> {
  if (inflightToken) return inflightToken;
  const p = (async () => {
    try {
      return await resolveAccessToken();
    } catch (e) {
      if (isSentryEnabled()) {
        captureError(e, { area: "api-client.getAccessToken" });
        authFlowBreadcrumb("get_access_token", {
          step: "error",
          message: e instanceof Error ? e.message : String(e),
        });
      }
      return null;
    } finally {
      inflightToken = null;
    }
  })();
  inflightToken = p;
  return p;
}

supabase.auth.onAuthStateChange(() => {
  clearCachedToken();
});

/** Single client; each request resolves base URL via getApiBaseUrl (Expo web + dev localhost parity). */
const baseApi = createApiClient({
  baseUrl: APP_URL ?? "",
  getBaseUrl: getApiBaseUrl,
  getAccessToken,
  headers: { "X-App": "provider" },
  getDefaultHeaders: (ctx) => ({
    ...webApiTenantHeaders(),
    "X-Active-Market-Country": getDeviceRegionCountryIso(),
    ...activeProviderIdHeadersForPath(ctx.path),
  }),
});

if (__DEV__) {
  try {
    console.log("[API] Provider API client baseUrl:", getApiBaseUrl());
  } catch {
    console.log("[API] Provider API client (base URL will resolve on first request)");
  }
}

/** True if error indicates session is invalid (expired/revoked); network errors are transient. */
function isSessionInvalidError(error: { message?: string } | null): boolean {
  if (!error?.message) return false;
  const msg = error.message.toLowerCase();
  if (
    msg.includes("network") ||
    msg.includes("fetch failed") ||
    msg.includes("timeout") ||
    msg.includes("abort") ||
    msg.includes("connection")
  ) {
    return false;
  }
  // Supabase allows one user to have active sessions on multiple devices. Only
  // clear this device when GoTrue clearly says this refresh token/session is
  // unusable. Generic words like "refresh", "session", or "token" alone are
  // too broad and can log users out for transient or server-side auth noise.
  const invalidSessionMarkers = [
    "expired",
    "invalid",
    "revoked",
    "not found",
    "missing",
    "malformed",
    "already used",
    "jwt expired",
    "refresh token",
  ];
  return (
    invalidSessionMarkers.some((marker) => msg.includes(marker)) &&
    (msg.includes("session") || msg.includes("token") || msg.includes("jwt"))
  );
}

/** On 401: refresh session, retry once. Only sign out when Supabase itself rejects the session. */
async function withSessionRecovery<T>(
  fn: () => Promise<ApiResponse<T>>
): Promise<ApiResponse<T>> {
  const res = await fn();
  const status = getHttpErrorStatus(res.error);
  if (status !== 401) return res;

  clearCachedToken();
  const { error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError) {
    // Only sign out when Supabase explicitly invalidates the session (expired/revoked),
    // not for network failures, wrong APP_URL, or transient infra errors.
    if (isSessionInvalidError(refreshError)) {
      if (isSentryEnabled()) {
        authFlowBreadcrumb("session_recovery", { outcome: "sign_out", reason: refreshError.message });
      }
      let signOutTimeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          supabase.auth.signOut(),
          new Promise<never>((_, reject) => {
            signOutTimeout = setTimeout(() => reject(new Error("sign_out_timeout")), 2800);
          }),
        ]);
      } catch {
        await supabase.auth.signOut({ scope: "local" }).catch(() => {});
      } finally {
        // Clear the race timer so a resolved sign-out never leaves a dangling
        // timer holding the event loop open (e.g. Jest worker teardown).
        if (signOutTimeout) clearTimeout(signOutTimeout);
      }
    }
    return res;
  }

  const retry = await fn();
  // If the web API still returns 401 after a *successful* Supabase token refresh, the Supabase
  // session is valid — the rejection is coming from server config (wrong APP_URL, tenant header,
  // server-side role check, etc.). Do NOT sign out; the user would lose a perfectly valid session
  // and be stuck in a login loop. The caller/UI will surface the error instead.
  if (isSentryEnabled()) {
    const retryStatus = getHttpErrorStatus(retry.error);
    authFlowBreadcrumb("session_recovery", {
      outcome: retryStatus === 401 ? "second_401_no_signout" : "retry_ok",
      retryStatus,
    });
  }
  return retry;
}

/** API client – base URL resolved per request; session recovery on 401. */
export const api = {
  get: <T>(path: string, init?: ApiClientExtraOptions) =>
    withSessionRecovery<T>(() => baseApi.get<T>(path, init)),
  post: <T>(path: string, body?: ApiClientRequestBody, init?: ApiClientExtraOptions) =>
    withSessionRecovery<T>(() => baseApi.post<T>(path, body, init)),
  put: <T>(path: string, body?: ApiClientRequestBody, init?: ApiClientExtraOptions) =>
    withSessionRecovery<T>(() => baseApi.put<T>(path, body, init)),
  patch: <T>(path: string, body?: ApiClientRequestBody, init?: ApiClientExtraOptions) =>
    withSessionRecovery<T>(() => baseApi.patch<T>(path, body, init)),
  delete: <T>(path: string, init?: ApiClientExtraOptions) =>
    withSessionRecovery<T>(() => baseApi.delete<T>(path, init)),
  fetch: <T>(path: string, options?: Omit<RequestOptions, "baseUrl" | "getAccessToken">) =>
    withSessionRecovery<T>(() => baseApi.fetch<T>(path, options)),
};
