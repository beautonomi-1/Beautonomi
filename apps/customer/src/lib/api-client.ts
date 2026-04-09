/**
 * API client for customer app - calls apps/web with Bearer token.
 * Includes session recovery: on 401, refresh session and retry once; if still 401, sign out.
 */
import { createApiClient, type ApiClientExtraOptions } from "@beautonomi/api";
import type { ApiResponse } from "@beautonomi/types";
import { supabase } from "@/lib/supabase/client";
import { APP_URL, webApiTenantHeaders } from "@/config/public-env";
import { getDeviceRegionCountryIso } from "@/lib/device-default-country-dial";
import { authFlowBreadcrumb, captureError, isSentryEnabled } from "@/lib/sentry";

async function getAccessToken(): Promise<string | null> {
  if (isSentryEnabled()) {
    authFlowBreadcrumb("get_access_token", { step: "start" });
  }
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (isSentryEnabled()) {
      authFlowBreadcrumb("get_access_token", { step: "getUser_done", hasUser: !!user });
    }
    if (!user) {
      if (isSentryEnabled()) {
        authFlowBreadcrumb("get_access_token", { step: "complete", tokenPresent: false, reason: "no_user" });
      }
      return null;
    }
    const { data } = await supabase.auth.getSession();
    let token = data.session?.access_token ?? null;
    if (isSentryEnabled()) {
      authFlowBreadcrumb("get_access_token", { step: "getSession_done", hasAccessToken: !!token });
    }
    let usedRefresh = false;
    if (!token) {
      if (isSentryEnabled()) {
        authFlowBreadcrumb("get_access_token", { step: "refreshSession_start" });
      }
      const { data: refreshed } = await supabase.auth.refreshSession();
      token = refreshed.session?.access_token ?? null;
      usedRefresh = true;
      if (isSentryEnabled()) {
        authFlowBreadcrumb("get_access_token", {
          step: "refreshSession_done",
          hasAccessToken: !!token,
        });
      }
    }
    if (isSentryEnabled()) {
      authFlowBreadcrumb("get_access_token", {
        step: "complete",
        tokenPresent: !!token,
        usedRefresh,
      });
    }
    return token;
  } catch (e) {
    if (isSentryEnabled()) {
      captureError(e, { area: "api-client.getAccessToken" });
      authFlowBreadcrumb("get_access_token", {
        step: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
    throw e;
  }
}

const baseApi = createApiClient({
  baseUrl: APP_URL,
  getAccessToken,
  getDefaultHeaders: () => ({
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

  const { error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError) {
    // Only sign out when Supabase explicitly invalidates the session (expired/revoked).
    // Network failures, wrong APP_URL, and transient infra errors must not sign the user out.
    if (isSessionInvalidError(refreshError)) {
      if (isSentryEnabled()) {
        authFlowBreadcrumb("session_recovery", { outcome: "sign_out", reason: refreshError.message });
      }
      await supabase.auth.signOut();
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
  post: <T>(path: string, body?: Record<string, unknown>, init?: ApiClientExtraOptions) =>
    withSessionRecovery<T>(() => baseApi.post<T>(path, body, init)),
  put: <T>(path: string, body?: Record<string, unknown>, init?: ApiClientExtraOptions) =>
    withSessionRecovery<T>(() => baseApi.put<T>(path, body, init)),
  patch: <T>(path: string, body?: Record<string, unknown>, init?: ApiClientExtraOptions) =>
    withSessionRecovery<T>(() => baseApi.patch<T>(path, body, init)),
  delete: <T>(path: string, init?: ApiClientExtraOptions) =>
    withSessionRecovery<T>(() => baseApi.delete<T>(path, init)),
  fetch: <T>(path: string, options?: Record<string, unknown>) =>
    withSessionRecovery<T>(() => baseApi.fetch<T>(path, options)),
};

/**
 * Check if an API error indicates the session has expired.
 * Screens can use this to redirect to login when needed.
 */
export function isAuthError(res: ApiResponse<unknown>): boolean {
  if (!res.error) return false;
  const status = (res.error as any)?.status ?? (res.error as any)?.statusCode;
  return status === 401 || status === 403;
}

/**
 * Force logout and clear session when auth errors are detected.
 */
export async function handleAuthError(): Promise<void> {
  await supabase.auth.signOut();
}
