/**
 * Client-safe Amplitude identify helper
 *
 * Fetches user properties from the server API instead of importing server-only
 * code (getSupabaseServer, next/headers). Use this in Client Components.
 */

import type { UserProperties } from "./identify";

/**
 * Fetch user properties for Amplitude identification via API.
 * Uses the session cookie for authentication.
 */
export async function fetchIdentifyProperties(
  userData: {
    id: string;
    email?: string | null;
    phone?: string | null;
    user_metadata?: { full_name?: string } | null;
  },
  role: string
): Promise<UserProperties> {
  const res = await fetch("/api/me/analytics/identify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({
      email: userData.email,
      full_name: userData.user_metadata?.full_name,
      phone: userData.phone,
    }),
  });

  if (!res.ok) {
    throw new Error(`Identify API failed: ${res.status}`);
  }

  const json = await res.json();
  if (json.error) {
    throw new Error(json.error.message || "Identify failed");
  }

  return {
    ...json.data,
    user_id: userData.id,
    role,
  };
}
