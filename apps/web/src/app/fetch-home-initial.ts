import "server-only";

import { createNextRequestFromHeaders } from "@/lib/server/create-next-request";
import { GET as getPublicHome } from "@/app/api/public/home/route";
import type { HomePageInitialData } from "@/app/home/home-initial-types";

function apiMessage(json: unknown): string {
  if (!json || typeof json !== "object") return "Invalid response";
  const e = (json as { error?: { message?: string } | string }).error;
  if (typeof e === "object" && e?.message) return e.message;
  if (typeof e === "string") return e;
  return "Request failed";
}

/**
 * Server-side load for `/` — invokes GET /api/public/home in-process (no loopback HTTP).
 * Matches first client paint without lat/lng; sections refine after `useUserLocation` resolves.
 */
export async function fetchHomeInitial(searchParams: {
  category?: string;
}): Promise<{ data: HomePageInitialData | null; error: string | null }> {
  try {
    const cat = searchParams.category?.trim();
    const qs =
      cat && cat !== "all"
        ? `?category=${encodeURIComponent(cat)}`
        : "";
    const req = await createNextRequestFromHeaders(`/api/public/home${qs}`);
    const res = await getPublicHome(req);
    let json: { data?: HomePageInitialData; error?: unknown } = {};
    try {
      json = (await res.json()) as typeof json;
    } catch {
      return { data: null, error: "Invalid response from home API" };
    }
    if (!res.ok) {
      return { data: null, error: apiMessage(json) };
    }
    const data = json.data;
    if (!data || typeof data !== "object") {
      return { data: null, error: "Empty home payload" };
    }
    return { data: data as HomePageInitialData, error: null };
  } catch (e) {
    return {
      data: null,
      error: e instanceof Error ? e.message : "Failed to load home",
    };
  }
}
