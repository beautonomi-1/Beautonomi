import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { fetchScopedSingle } from "@/lib/tenant/scoped-overrides";
import { resolveTenantFromRequest } from "@/lib/tenant/resolve-tenant-from-db";

interface PlatformBranding {
  site_name: string;
  logo_url: string;
  favicon_url: string;
  primary_color: string;
  secondary_color: string;
}

/**
 * GET /api/public/settings/branding
 * 
 * Get platform branding settings (public endpoint, no auth required)
 */
export async function GET(_request: NextRequest) {
  try {
    const request = _request as Request;
    const supabase = await getSupabaseServer();
    const tenant = await resolveTenantFromRequest(request);
    const tenantId = tenant?.id ?? "";

    // Default branding values
    const defaultBranding: PlatformBranding = {
      site_name: "Beautonomi",
      logo_url: "/images/logo.svg",
      favicon_url: "/icon.svg",
      primary_color: "#FF0077",
      secondary_color: "#D60565",
    };

    // If Supabase client is null, return defaults
    if (!supabase) {
      return successResponse(defaultBranding);
    }

    // Try to get from database (table might not exist yet)
    try {
      const scopedSettings = await fetchScopedSingle<{ settings?: Record<string, unknown> }>({
        supabase: supabase as any,
        table: "platform_settings",
        tenantId,
        select: "settings",
        apply: (q) => q.eq("is_active", true),
        orderBy: { column: "updated_at", ascending: false },
      });
      const settings = scopedSettings.data;
      if (!settings) {
        return successResponse(defaultBranding);
      }

      if (settings && (settings as any).settings && (settings as any).settings.branding) {
        const raw = (settings as any).settings.branding as Record<string, any>;
        const safe: PlatformBranding = {
          site_name: typeof raw.site_name === "string" ? raw.site_name : defaultBranding.site_name,
          logo_url: typeof raw.logo_url === "string" ? raw.logo_url : defaultBranding.logo_url,
          favicon_url: typeof raw.favicon_url === "string" ? raw.favicon_url : defaultBranding.favicon_url,
          primary_color: typeof raw.primary_color === "string" ? raw.primary_color : defaultBranding.primary_color,
          secondary_color: typeof raw.secondary_color === "string" ? raw.secondary_color : defaultBranding.secondary_color,
        };
        return successResponse(safe);
      }
    } catch (error) {
      // Table might not exist, return default settings
      console.warn("Platform settings table may not exist, using defaults:", error);
    }

    return successResponse(defaultBranding);
  } catch (error) {
    return handleApiError(error, "Failed to load branding settings");
  }
}
