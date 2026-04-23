/**
 * API client for customer app - calls apps/web with Bearer token.
 * Includes session recovery: on 401, refresh session and retry once; if still 401, sign out.
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

/**
 * §Customer-audit 2026-04 (P1 PERF): previously every single API call did
 * `supabase.auth.getUser()` (a NETWORK ROUND-TRIP to Supabase's `/user`
 * endpoint), then `getSession()`, then optionally `refreshSession()`.
 * On the profile tab alone that meant ~10 network calls (2 API calls x
 * getUser + getSession) just to authenticate — plus the actual API
 * request. That's why every click felt slow and the profile tab lagged.
 *
 * The new flow is fully local unless the token is actually expired:
 *   1. `getSession()` — purely local, reads from SecureStore/AsyncStorage
 *   2. If no session → not signed in → return null (no network).
 *   3. If session present and NOT expired → return the cached token.
 *   4. Only if expired (or close to expiring) → `refreshSession()`.
 *
 * Token validity is also cached for 30s so back-to-back parallel calls
 * don't all touch the auth subsystem. 401s from the server still trigger
 * `withSessionRecovery` below which does a refresh + single retry.
 */

const TOKEN_CACHE_TTL_MS = 30_000;
// Refresh pre-emptively when less than 60 s remain on the token so the
// server never sees an expired JWT even under clock skew.
const REFRESH_LEEWAY_MS = 60_000;

type CachedToken = { token: string; expiresAtMs: number; fetchedAtMs: number };
let cachedToken: CachedToken | null = null;
let inflightToken: Promise<string | null> | null = null;

function clearCachedToken(): void {
  cachedToken = null;
}

/**
 * Drop the in-memory JWT cache immediately (e.g. user tapped Log out).
 * Also clears any in-flight token resolution so we never attach a stale
 * bearer after `updateSession(null)` has already run.
 */
export function invalidateApiAccessTokenCache(): void {
  inflightToken = null;
  clearCachedToken();
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
    !token ||
    (expiresAtMs > 0 && expiresAtMs - now <= REFRESH_LEEWAY_MS);

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
    if (isSentryEnabled()) {
      authFlowBreadcrumb("get_access_token", {
        step: "refreshSession_done",
        hasAccessToken: !!token,
      });
    }
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
      throw e;
    } finally {
      inflightToken = null;
    }
  })();
  inflightToken = p;
  return p;
}

// Drop the cached token whenever auth state changes so we never ship a
// stale JWT after sign-in/out or token refresh from another tab.
supabase.auth.onAuthStateChange(() => {
  clearCachedToken();
});

const baseApi = createApiClient({
  baseUrl: APP_URL,
  /** Align with config bundle / Help WebView: localhost in dev when EXPO_PUBLIC_APP_URL is unset. */
  getBaseUrl: getBackendUrl,
  getAccessToken,
  getDefaultHeaders: (_ctx) => ({
    ...webApiTenantHeaders(),
    "X-Active-Market-Country": getDeviceRegionCountryIso(),
  }),
});

/**
 * True when the error clearly indicates the session is expired/revoked (not a network/config issue).
 * We must NOT sign out on transient errors (network down, wrong APP_URL, etc.) — that would cause
 * the login loop where the user is immediately redirected back to the login screen after signing in.
 */
function isSessionInvalidError(error: { message?: string } | null): boolean {
  if (!error?.message) return false;
  const msg = error.message.toLowerCase();
  // Network / infra problems are transient — do not treat as invalid session
  if (
    msg.includes("network") ||
    msg.includes("fetch failed") ||
    msg.includes("failed to fetch") ||
    msg.includes("timeout") ||
    msg.includes("abort") ||
    msg.includes("connection") ||
    msg.includes("econnrefused") ||
    msg.includes("cannot connect")
  ) {
    return false;
  }
  return (
    msg.includes("refresh") ||
    msg.includes("session") ||
    msg.includes("token") ||
    msg.includes("expired") ||
    msg.includes("invalid") ||
    msg.includes("revoked") ||
    msg.includes("not found")
  );
}

/** On 401: refresh session, retry request once; sign out ONLY when Supabase itself rejects the session. */
async function withSessionRecovery<T>(
  fn: () => Promise<ApiResponse<T>>
): Promise<ApiResponse<T>> {
  const res = await fn();
  const status = (res.error as { status?: number } | undefined)?.status;
  if (status !== 401) return res;

  clearCachedToken();
  const { error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError) {
    // Only sign out when Supabase explicitly invalidates the session (expired/revoked).
    // Network failures, wrong APP_URL, and transient infra errors must not sign the user out.
    if (isSessionInvalidError(refreshError)) {
      if (isSentryEnabled()) {
        authFlowBreadcrumb("session_recovery", { outcome: "sign_out", reason: refreshError.message });
      }
      try {
        await Promise.race([
          supabase.auth.signOut(),
          new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error("sign_out_timeout")), 2800);
          }),
        ]);
      } catch {
        await supabase.auth.signOut({ scope: "local" }).catch(() => {});
      }
    }
    return res;
  }

  const retry = await fn();
  // If the web API still returns 401 after a *successful* Supabase token refresh, the Supabase
  // session is valid — the rejection is from server config (wrong APP_URL, tenant, role check).
  // Do NOT sign out; signing out would cause a login loop with a perfectly valid session.
  if (isSentryEnabled()) {
    const retryStatus = (retry.error as { status?: number } | undefined)?.status;
    authFlowBreadcrumb("session_recovery", {
      outcome: retryStatus === 401 ? "second_401_no_signout" : "retry_ok",
      retryStatus,
    });
  }
  return retry;
}

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

/**
 * Check if an API error indicates the session has expired.
 * Screens can use this to redirect to login when needed.
 */
export function isAuthError(res: ApiResponse<unknown>): boolean {
  if (!res.error) return false;
  const status = getHttpErrorStatus(res.error);
  return status === 401 || status === 403;
}

/**
 * Force logout and clear session when auth errors are detected.
 * Same bounded sign-out pattern as `AuthProvider.signOut` so this never
 * hangs the UI when GoTrue is slow.
 */
export async function handleAuthError(): Promise<void> {
  invalidateApiAccessTokenCache();
  try {
    await Promise.race([
      supabase.auth.signOut(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("sign_out_timeout")), 2800);
      }),
    ]);
  } catch {
    await supabase.auth.signOut({ scope: "local" }).catch(() => {});
  }
}
