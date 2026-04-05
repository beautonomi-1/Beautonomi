import type { ProviderDashboardStats } from "./provider-dashboard-stats";
import { createNextRequestFromHeaders } from "@/lib/server/create-next-request";
import { getProviderDashboardResponse } from "@/lib/server/provider/get-provider-dashboard";

export interface DashboardInitialPayload {
  stats: ProviderDashboardStats | null;
  error: string | null;
  missingProfile: boolean;
}

/**
 * Server-side load for /provider/dashboard — invokes shared dashboard handler directly
 * (no loopback HTTP; fastest TTFB).
 */
export async function fetchDashboardInitial(): Promise<DashboardInitialPayload> {
  try {
    const req = await createNextRequestFromHeaders("/api/provider/dashboard?include=insights");
    const res = await getProviderDashboardResponse(req);

    let json: { data?: ProviderDashboardStats; error?: { message?: string } | string } = {};
    try {
      json = await res.json();
    } catch {
      return {
        stats: null,
        error: "Invalid response from dashboard API",
        missingProfile: false,
      };
    }

    if (!res.ok) {
      const msg =
        typeof json?.error === "object" && json.error?.message
          ? json.error.message
          : typeof json?.error === "string"
            ? json.error
            : `HTTP ${res.status}`;
      const missing =
        res.status === 404 ||
        String(msg).toLowerCase().includes("provider profile not found") ||
        String(msg).toLowerCase().includes("provider not found");
      return { stats: null, error: msg, missingProfile: missing };
    }

    const stats = json?.data ?? null;
    if (!stats || typeof stats !== "object") {
      return { stats: null, error: "Unable to load dashboard data", missingProfile: false };
    }

    return { stats, error: null, missingProfile: false };
  } catch (e) {
    return {
      stats: null,
      error: e instanceof Error ? e.message : "Failed to load dashboard",
      missingProfile: false,
    };
  }
}
