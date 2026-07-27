import { NextRequest, NextResponse } from "next/server";
import { getPublicConfigBundle } from "@/lib/config";
import type { Platform, Environment } from "@/lib/config/types";
import { DEFAULT_PUBLIC_AUTH } from "@/lib/config/auth-policy-public";
import { resolveActiveMarketFromRequest } from "@/lib/tenant/resolve-active-market";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";

export const dynamic = "force-dynamic";
export const revalidate = 300;

const PLATFORMS: Platform[] = ["web", "customer", "provider"];
const ENVS: Environment[] = ["production", "staging", "development"];

function parsePlatform(s: string | null): Platform {
  if (s && PLATFORMS.includes(s as Platform)) return s as Platform;
  return "web";
}

function parseEnvironment(s: string | null): Environment {
  if (s && ENVS.includes(s as Environment)) return s as Environment;
  return "production";
}

/**
 * GET /api/public/config-bundle
 * Public bootstrap config: amplitude, third_party, branding, flags, modules.
 * No auth required. Never returns secrets.
 * Query: platform=web|customer|provider, environment=production|staging|development, app_version=..., country= (optional ISO2 override).
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const platform = parsePlatform(searchParams.get("platform"));
    const environment = parseEnvironment(searchParams.get("environment"));
    const appVersion = searchParams.get("app_version") ?? null;
    const role = searchParams.get("role") ?? null;
    const userId = searchParams.get("user_id") ?? null;
    const providerId = searchParams.get("provider_id") ?? null;

    const market = resolveActiveMarketFromRequest(request, searchParams.get("country"));

    let resolvedTenantId: string | null = null;
    try {
      resolvedTenantId = await resolveTenantIdWithZaFallback(request);
    } catch (tenantErr) {
      console.warn(
        "Tenant resolution failed in /api/public/config-bundle (bundle may use platform defaults):",
        tenantErr,
      );
      resolvedTenantId = null;
    }

    const bundle = await getPublicConfigBundle({
      platform,
      environment,
      appVersion,
      role: role || undefined,
      userId: userId || undefined,
      providerId: providerId || undefined,
      tenantId: resolvedTenantId,
    });

    const body = JSON.stringify({
      ...bundle,
      meta: {
        ...bundle.meta,
        active_market_country: market.countryCode,
        active_market_source: market.source,
      },
    });
    const etag = `"${Buffer.from(body).toString("base64").slice(0, 32)}"`;

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        ETag: etag,
      },
    });
  } catch (error) {
    console.error("config-bundle error:", error);
    const { searchParams } = new URL(request.url);
    const platform = parsePlatform(searchParams.get("platform"));
    const environment = parseEnvironment(searchParams.get("environment"));
    const appVersion = searchParams.get("app_version") ?? null;
    const market = resolveActiveMarketFromRequest(request, searchParams.get("country"));
    const fallback = {
        meta: {
          env: environment,
          platform,
          version: appVersion,
          fetched_at: new Date().toISOString(),
          active_market_country: market.countryCode,
          active_market_source: market.source,
        },
        auth: { ...DEFAULT_PUBLIC_AUTH },
        amplitude: {
          api_key_public: null,
          environment: "production",
          enabled_client_portal: false,
          enabled_provider_portal: false,
          enabled_admin_portal: false,
          guides_enabled: false,
          surveys_enabled: false,
          sampling_rate: 1,
          debug_mode: false,
        },
        third_party: {},
        branding: {
          site_name: "Beautonomi",
          logo_url: "/images/logo.svg",
          favicon_url: "/icon.svg",
          primary_color: "#FF0077",
          secondary_color: "#D60565",
        },
        flags: {},
        modules: {
          on_demand: {
            enabled: false,
            ringtone_asset_path: null,
            ring_duration_seconds: 20,
            ring_repeat: true,
            normal_booking_ringtone_asset_path: null,
            normal_booking_ring_duration_seconds: 20,
            normal_booking_ring_repeat: true,
            waiting_screen_timeout_seconds: 45,
            provider_accept_window_seconds: 30,
            ui_copy: {},
          },
          ai: {
            enabled: false,
            sampling_rate: 0,
            cache_ttl_seconds: 86400,
            default_model_tier: "cheap",
            max_tokens: 600,
            temperature: 0.3,
            daily_budget_credits: 0,
            per_provider_calls_per_day: 0,
            per_user_calls_per_day: 0,
          },
          ads: { enabled: false },
          ranking: { enabled: false, weights: {} },
          distance: { enabled: false },
          sumsub: { enabled: false },
          aura: { enabled: false },
          safety: { enabled: false, check_in_enabled: true, escalation_enabled: true, cooldown_seconds: 300, ui_copy: {} },
        },
        verification: {
          mode: "off",
          sumsub_enabled: false,
          didit_enabled: false,
          manual_enabled: true,
          required_for_providers: false,
          required_for_payouts: false,
          required_for_customers: false,
          cross_validate: false,
          min_age: 18,
          kyb_enabled: false,
          kyb_required_for_business: false,
        },
        content_safety: {
          social_min_age: 13,
          social_age_gate_mode: "log",
          controls_enabled: true,
        },
      };
    const body = JSON.stringify(fallback);
    const etag = `"${Buffer.from(body).toString("base64").slice(0, 32)}"`;
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        ETag: etag,
      },
    });
  }
}
