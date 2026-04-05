import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * GET /api/public/geo-country
 * Best-effort ISO 3166-1 alpha-2 from edge / CDN headers (e.g. Vercel, Cloudflare).
 */
export async function GET(_request: NextRequest) {
  try {
    const h = await headers();
    const raw =
      h.get("x-vercel-ip-country") ||
      h.get("cf-ipcountry") ||
      h.get("cloudfront-viewer-country") ||
      h.get("x-appengine-country") ||
      "";
    const iso = raw.trim().toUpperCase();
    if (iso && /^[A-Z]{2}$/.test(iso) && iso !== "XX" && iso !== "T1") {
      return successResponse({ countryCode: iso });
    }
    return successResponse({ countryCode: null as string | null });
  } catch (error) {
    return handleApiError(error, "Failed to resolve country");
  }
}
