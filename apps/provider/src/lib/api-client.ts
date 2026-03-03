/**
 * API client for provider app - calls apps/web with Bearer token.
 */
import { createApiClient } from "@beautonomi/api";
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

/** API client – baseUrl is resolved on first use so Expo web always gets localhost:3000 when at :8081/:8082. */
export const api = {
  get: <T>(path: string, init?: RequestInit) => getApi().get<T>(path, init),
  post: <T>(path: string, body?: Record<string, unknown>, init?: RequestInit) =>
    getApi().post<T>(path, body, init),
  put: <T>(path: string, body?: Record<string, unknown>, init?: RequestInit) =>
    getApi().put<T>(path, body, init),
  patch: <T>(path: string, body?: Record<string, unknown>, init?: RequestInit) =>
    getApi().patch<T>(path, body, init),
  delete: <T>(path: string, init?: RequestInit) => getApi().delete<T>(path, init),
  fetch: <T>(path: string, options?: Record<string, unknown>) => getApi().fetch<T>(path, options),
};
