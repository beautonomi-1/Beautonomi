/**
 * API client for customer app - calls apps/web with Bearer token.
 * Includes session recovery: on 401, refresh session and retry once; if still 401, sign out.
 */
import { createApiClient, type ApiClientExtraOptions } from "@beautonomi/api";
import type { ApiResponse } from "@beautonomi/types";
import { supabase } from "@/lib/supabase/client";
import { APP_URL, webApiTenantHeaders } from "@/config/public-env";
import { getDeviceRegionCountryIso } from "@/lib/device-default-country-dial";

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

const baseApi = createApiClient({
  baseUrl: APP_URL,
  getAccessToken,
  getDefaultHeaders: () => ({
    ...webApiTenantHeaders(),
    "X-Active-Market-Country": getDeviceRegionCountryIso(),
  }),
});

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
