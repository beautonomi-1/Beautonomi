/**
 * API client for customer app - calls apps/web with Bearer token.
 * Includes centralized error handling for auth failures.
 */
import { createApiClient } from "@beautonomi/api";
import type { ApiResponse } from "@beautonomi/types";
import { supabase } from "@/lib/supabase/client";
import { APP_URL } from "@/config/public-env";

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export const api = createApiClient({
  baseUrl: APP_URL,
  getAccessToken,
});

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
