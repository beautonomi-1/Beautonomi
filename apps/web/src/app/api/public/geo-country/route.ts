import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { getTenantRegionConfig } from "@/lib/regions/config";

const ISO2 = /^[A-Z]{2}$/;

async function resolveTenantCountryCode(request: NextRequest): Promise<string | null> {
  try {
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const cfg = await getTenantRegionConfig(tenantId);
    const code = String(cfg?.regionCode ?? "").trim().toUpperCase();
    return ISO2.test(code) ? code : null;
  } catch {
    return null;
  }
}

/**
 * GET /api/public/geo-country
 * `countryCode`: best-effort ISO 3166-1 alpha-2 from edge / CDN headers (e.g. Vercel, Cloudflare).
 * `tenantCountryCode`: the host tenant's market, for clients that need a default when geo is unknown.
 */
export async function GET(request: NextRequest) {
  try {
    const h = await headers();
    const raw =
      h.get("x-vercel-ip-country") ||
      h.get("cf-ipcountry") ||
      h.get("cloudfront-viewer-country") ||
      h.get("x-appengine-country") ||
      "";
    const iso = raw.trim().toUpperCase();
    const countryCode = iso && ISO2.test(iso) && iso !== "XX" && iso !== "T1" ? iso : null;
    const tenantCountryCode = await resolveTenantCountryCode(request);
    return successResponse({ countryCode, tenantCountryCode });
  } catch (error) {
    return handleApiError(error, "Failed to resolve country");
  }
}
