/**
 * API client for provider app - calls apps/web with Bearer token.
 * Includes session recovery: on 401, refresh session and retry once; if still 401, sign out.
 */
import { createApiClient } from "@beautonomi/api";
import type { ApiResponse } from "@beautonomi/types";
import { Platform } from "react-native";
import { supabase } from "@/lib/supabase/client";
import { APP_URL } from "@/config/public-env";

/** When Expo web runs at localhost:8081/8082 (or APP_URL unset on web), use Next.js at :3000. */
function getApiBaseUrl(): string {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const origin = window.location.origin;
    if (
      origin === "http://localhost:8081" ||
      origin === "http://localhost:8082" ||
      !APP_URL?.trim()
    ) {
      if (__DEV__) {
        console.log("[API] Using backend URL http://localhost:3000 (Expo web local dev)");
      }
      return "http://localhost:3000";
    }
  }
  return APP_URL?.trim() || "http://localhost:3000";
}

async function getAccessToken(): Promise<string | null> {
  // Validate session with auth server and refresh if expired (getSession() alone does not refresh).
  // Without this, an expired access_token is sent and the API returns "Auth session missing!".
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

// Lazy init so baseUrl is resolved at first request time (window is definitely ready)
let _api: ReturnType<typeof createApiClient> | null = null;
function getApi(): ReturnType<typeof createApiClient> {
  if (!_api) {
    const baseUrl = getApiBaseUrl();
    if (__DEV__) {
      console.log("[API] Provider API client baseUrl:", baseUrl);
    }
    _api = createApiClient({
      baseUrl,
      getAccessToken,
      headers: { "X-App": "provider" },
    });
  }
  return _api;
}

/** On 401: refresh session, retry request once; if still 401, sign out. */
async function withSessionRecovery<T>(
  fn: () => Promise<ApiResponse<T>>
): Promise<ApiResponse<T>> {
  const res = await fn();
  const status = (res.error as { status?: number } | undefined)?.status;
  if (status !== 401) return res;
  const { error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError) {
    await supabase.auth.signOut();
    return res;
  }
  const retry = await fn();
  if ((retry.error as { status?: number } | undefined)?.status === 401) {
    await supabase.auth.signOut();
  }
  return retry;
}

/** API client – baseUrl is resolved on first use; session recovery on 401. */
export const api = {
  get: <T>(path: string, init?: RequestInit) =>
    withSessionRecovery<T>(() => getApi().get<T>(path, init)),
  post: <T>(path: string, body?: Record<string, unknown>, init?: RequestInit) =>
    withSessionRecovery<T>(() => getApi().post<T>(path, body, init)),
  put: <T>(path: string, body?: Record<string, unknown>, init?: RequestInit) =>
    withSessionRecovery<T>(() => getApi().put<T>(path, body, init)),
  patch: <T>(path: string, body?: Record<string, unknown>, init?: RequestInit) =>
    withSessionRecovery<T>(() => getApi().patch<T>(path, body, init)),
  delete: <T>(path: string, init?: RequestInit) =>
    withSessionRecovery<T>(() => getApi().delete<T>(path, init)),
  fetch: <T>(path: string, options?: Record<string, unknown>) =>
    withSessionRecovery<T>(() => getApi().fetch<T>(path, options)),
};
