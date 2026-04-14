/**
 * API client for provider app - calls apps/web with Bearer token only (no cookies).
 * Session recovery: on 401, refresh and retry once; sign out only when session is invalid,
 * not on network errors, so the app won't randomly logout.
 */
import { createApiClient, type ApiClientExtraOptions } from "@beautonomi/api";
import type { ApiResponse } from "@beautonomi/types";
import { Platform } from "react-native";
import { supabase } from "@/lib/supabase/client";
import { APP_URL, webApiTenantHeaders } from "@/config/public-env";
import { getDeviceRegionCountryIso } from "@/lib/device-default-country-dial";
import { authFlowBreadcrumb, captureError, isSentryEnabled } from "@/lib/sentry";

/** Resolve API base URL with strict production safeguards. Never throws — callers expect sync resolution inside apiFetch try/catch. */
function getApiBaseUrl(): string {
  const configured = APP_URL?.trim() ?? "";
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const origin = window.location.origin;
    const isLocalExpoWeb =
      origin === "http://localhost:8081" || origin === "http://localhost:8082";
    if (
      __DEV__ &&
      (isLocalExpoWeb || !configured)
    ) {
      if (__DEV__) {
        console.log("[API] Using backend URL http://localhost:3000 (Expo web local dev)");
      }
      return "http://localhost:3000";
    }
  }
  if (!configured) {
    if (__DEV__) {
      console.warn(
        "[API] Missing EXPO_PUBLIC_APP_URL; using http://localhost:3000 for dev. Configure apps/provider/.env.local for production.",
      );
      return "http://localhost:3000";
    }
    // Production without URL: avoid throwing (unhandled rejection). Requests fail with a clear network error.
    console.error(
      "Missing EXPO_PUBLIC_APP_URL for provider API client. Configure apps/provider/.env.",
    );
    return "";
  }
  return configured;
}

async function getAccessToken(): Promise<string | null> {
  // Validate session with auth server and refresh if expired (getSession() alone does not refresh).
  // Without this, an expired access_token is sent and the API returns "Auth session missing!".
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
    // Right after login on iOS, getSession() can briefly return null while storage catches up;
    // refreshSession() usually yields a valid token for /api/me/portal.
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

/** Single client; each request resolves base URL via getApiBaseUrl (Expo web + dev localhost parity). */
const baseApi = createApiClient({
  baseUrl: APP_URL ?? "",
  getBaseUrl: getApiBaseUrl,
  getAccessToken,
  headers: { "X-App": "provider" },
  getDefaultHeaders: () => ({
    ...webApiTenantHeaders(),
    "X-Active-Market-Country": getDeviceRegionCountryIso(),
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

/** On 401: refresh session, retry once. Only sign out when Supabase itself rejects the session. */
async function withSessionRecovery<T>(
  fn: () => Promise<ApiResponse<T>>
): Promise<ApiResponse<T>> {
  const res = await fn();
  const status = (res.error as { status?: number } | undefined)?.status;
  if (status !== 401) return res;

  const { error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError) {
    // Only sign out when Supabase explicitly invalidates the session (expired/revoked),
    // not for network failures, wrong APP_URL, or transient infra errors.
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
  // session is valid — the rejection is coming from server config (wrong APP_URL, tenant header,
  // server-side role check, etc.). Do NOT sign out; the user would lose a perfectly valid session
  // and be stuck in a login loop. The caller/UI will surface the error instead.
  if (isSentryEnabled()) {
    const retryStatus = (retry.error as { status?: number } | undefined)?.status;
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
