/**
 * Client-safe Amplitude identify helper
 *
 * Fetches user properties from the server API instead of importing server-only
 * code (getSupabaseServer, next/headers). Use this in Client Components.
 */

import type { UserProperties } from "./identify";
import { getCsrfHeaders } from "@/lib/csrf";
import { getFirstTouchForIdentify } from "./marketing-attribution";

/** Detect device type from user agent (browser only; for attribution) */
function getDeviceType(): string {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent.toLowerCase();
  if (/tablet|ipad|playbook|silk/i.test(ua)) return "tablet";
  if (/mobile|iphone|ipod|android|blackberry|opera|mini|windows\sce|palm|smartphone|iemobile/i.test(ua)) return "mobile";
  return "desktop";
}

export interface IdentifyOverrides {
  portal?: "client" | "provider" | "admin";
  platform?: string;
  device_type?: string;
}

/**
 * Fetch user properties for Amplitude identification via API.
 * Uses the session cookie for authentication.
 * Pass overrides (portal, platform, device_type) for proper attribution from the browser.
 */
export async function fetchIdentifyProperties(
  userData: {
    id: string;
    email?: string | null;
    phone?: string | null;
    user_metadata?: { full_name?: string } | null;
  },
  role: string,
  overrides?: IdentifyOverrides
): Promise<UserProperties | null> {
  try {
    const body: Record<string, unknown> = {
      email: userData.email,
      full_name: userData.user_metadata?.full_name,
      phone: userData.phone,
    };
    if (overrides?.portal) body.portal = overrides.portal;
    if (overrides?.platform) body.platform = overrides.platform;
    if (overrides?.device_type) body.device_type = overrides.device_type;
    if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_APP_VERSION) {
      body.app_version = process.env.NEXT_PUBLIC_APP_VERSION;
    }

    const firstTouch = getFirstTouchForIdentify();
    for (const [k, v] of Object.entries(firstTouch)) {
      (body as Record<string, unknown>)[k] = v;
    }

    const res = await fetch("/api/me/analytics/identify", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getCsrfHeaders() },
      credentials: "same-origin",
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      // Includes auth drift cases (401/403) during tab switches/logouts.
      // Identify is optional, so always fail-soft.
      return null;
    }

    const json = await res.json().catch(() => null);
    if (!json || json.error) {
      return null;
    }

    return {
      ...json.data,
      user_id: userData.id,
      role,
    };
  } catch {
    // Network-layer errors (offline, proxy hiccup, dev reload race) should not
    // break page flow or spam console. Skip identify for this cycle.
    return null;
  }
}

/** Get device type for attribution (call from browser only) */
export function getDeviceTypeForAttribution(): string {
  return getDeviceType();
}
