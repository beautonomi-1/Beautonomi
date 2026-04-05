import { NextRequest } from "next/server";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { resolveActiveMarketFromRequest } from "@/lib/tenant/resolve-active-market";
import { resolveTenantFromRequest } from "@/lib/tenant/resolve-tenant-from-db";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  evaluateMarketAvailability,
  getSupportedMarketCountries,
} from "@/lib/tenant/market-availability";
import { resolveTenantRoutingDecision } from "@/lib/tenant/market-routing";

/**
 * GET /api/public/tenant-context
 * DB-backed tenant from Host → tenant_domains; market ISO2 fallback; legal hints from tenant_settings (spec §12).
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const market = resolveActiveMarketFromRequest(request, searchParams.get("country"));
    const tenant = await resolveTenantFromRequest(request);
    const availability = evaluateMarketAvailability(market.countryCode);
    let preferredHomeTenantId: string | null = null;
    try {
      const userSupabase = await getSupabaseServer(request);
      const { data: authData } = await userSupabase.auth.getUser();
      const uid = authData.user?.id;
      if (uid) {
        const { data: userRow } = await userSupabase
          .from("users")
          .select("preferred_home_tenant_id")
          .eq("id", uid)
          .maybeSingle();
        preferredHomeTenantId =
          (userRow as { preferred_home_tenant_id?: string | null } | null)?.preferred_home_tenant_id ??
          null;
      }
    } catch {
      preferredHomeTenantId = null;
    }
    const routing = await resolveTenantRoutingDecision({
      request,
      countryCode: market.countryCode,
      marketSource: market.source,
      availabilityStatus: availability.status,
      preferredHomeTenantId,
    });

    let settings: Record<string, unknown> | null = null;
    if (tenant?.id) {
      try {
        const supabase = getSupabaseAdmin();
        const { data } = await supabase
          .from("tenant_settings")
          .select("settings")
          .eq("tenant_id", tenant.id)
          .maybeSingle();
        const raw = (data as { settings?: Record<string, unknown> } | null)?.settings;
        settings = raw && typeof raw === "object" ? raw : null;
      } catch {
        settings = null;
      }
    }

    const legal =
      settings &&
      (settings.terms_doc_version != null ||
        settings.privacy_doc_version != null ||
        settings.termsDocVersion != null ||
        settings.privacyDocVersion != null)
        ? {
            termsDocVersion:
              (settings.terms_doc_version as string | undefined) ??
              (settings.termsDocVersion as string | undefined) ??
              null,
            privacyDocVersion:
              (settings.privacy_doc_version as string | undefined) ??
              (settings.privacyDocVersion as string | undefined) ??
              null,
          }
        : null;

    return successResponse({
      tenant: tenant
        ? {
            id: tenant.id,
            slug: tenant.slug,
            name: tenant.name,
            regionCode: tenant.region_code,
            lifecycle: tenant.lifecycle,
            defaultCurrency: tenant.default_currency,
            defaultLanguage: tenant.default_language,
            defaultTimezone: tenant.default_timezone,
          }
        : null,
      legal,
      market: {
        countryCode: market.countryCode,
        source: market.source,
        host: market.host,
      },
      user: {
        preferredHomeTenantId,
      },
      availability: {
        status: availability.status,
        countryCode: availability.countryCode,
        reason: availability.reason,
        supportedCountries: Array.from(getSupportedMarketCountries()),
      },
      routing,
    });
  } catch (error) {
    return handleApiError(error, "Failed to resolve tenant context");
  }
}
