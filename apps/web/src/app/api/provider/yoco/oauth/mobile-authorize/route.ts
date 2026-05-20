import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, getProviderIdForUser } from "@/lib/supabase/api-helpers";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import {
  buildAuthorizeUrl,
  generateState,
  resolveOauthApp,
  YocoOAuthRequired,
} from "@/lib/payments/yoco-oauth";
import { type YocoEnvironment, getDefaultYocoEnvironment } from "@/lib/payments/yoco";
import { isFeatureEnabledServer } from "@/lib/server/feature-flags";
import { FEATURE_FLAG_KEYS } from "@/lib/server/feature-flag-keys";

const STATE_TTL_MS = 15 * 60 * 1000;

/**
 * POST /api/provider/yoco/oauth/mobile-authorize
 *
 * Native apps cannot rely on the system browser carrying the provider's web
 * session cookie. This endpoint authenticates with the app's API session,
 * creates the CSRF state row, and returns the Yoco authorize URL for the app to
 * open directly.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner"], request);
    const supabase = await getSupabaseServer(request);
    const body = (await request.json().catch(() => ({}))) as {
      environment?: string;
      return_to?: string | null;
    };

    const providerId = await getProviderIdForUser(user.id, supabase, { request });
    if (!providerId) {
      return NextResponse.json(
        { data: null, error: { message: "Provider not found", code: "PROVIDER_NOT_FOUND" } },
        { status: 404 },
      );
    }

    const admin = getSupabaseAdmin();
    const { data: integration } = await (admin.from("provider_yoco_integrations") as any)
      .select("environment, tenant_id")
      .eq("provider_id", providerId)
      .maybeSingle();
    const integrationRow = integration as {
      environment?: string;
      tenant_id?: string | null;
    } | null;

    const requestedEnv = String(body.environment ?? "").toLowerCase();
    const environment: YocoEnvironment =
      requestedEnv === "sandbox" || requestedEnv === "live"
        ? requestedEnv
        : integrationRow?.environment === "sandbox" || integrationRow?.environment === "live"
          ? integrationRow.environment
          : getDefaultYocoEnvironment();
    const tenantId = integrationRow?.tenant_id ?? (await resolveTenantIdWithZaFallback(request)) ?? null;
    const returnTo = sanitizeReturnTo(body.return_to);

    const oauthEnabled = await isFeatureEnabledServer(FEATURE_FLAG_KEYS.YOCO_OAUTH_V2, tenantId);
    if (!oauthEnabled) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message:
              "Yoco Web POS is not yet enabled for your account. Contact support to enable terminal payments.",
            code: "YOCO_OAUTH_DISABLED",
          },
        },
        { status: 503 },
      );
    }

    const app = await resolveOauthApp(tenantId, environment);
    const state = generateState();
    const { error: stateError } = await (admin.from("yoco_oauth_states") as any).insert({
      state,
      provider_id: providerId,
      tenant_id: tenantId,
      environment,
      return_to: returnTo,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + STATE_TTL_MS).toISOString(),
    });
    if (stateError) {
      console.error("Failed to write Yoco mobile oauth state:", stateError);
      return NextResponse.json(
        { data: null, error: { message: "Could not start Yoco connection", code: "STATE_ERROR" } },
        { status: 500 },
      );
    }

    return NextResponse.json({
      data: {
        authorize_url: buildAuthorizeUrl({ app, state }),
        expires_at: new Date(Date.now() + STATE_TTL_MS).toISOString(),
      },
      error: null,
    });
  } catch (error: any) {
    const msg = error?.message ?? "";
    if (msg === "Authentication required" || msg.startsWith("Insufficient permissions")) {
      return NextResponse.json(
        { data: null, error: { message: msg, code: "UNAUTHORIZED" } },
        { status: 401 },
      );
    }
    if (error instanceof YocoOAuthRequired) {
      return NextResponse.json(
        { data: null, error: { message: error.message, code: error.code } },
        { status: 503 },
      );
    }
    console.error("/api/provider/yoco/oauth/mobile-authorize error:", error);
    return NextResponse.json(
      { data: null, error: { message: "Could not start Yoco connection", code: "INTERNAL_ERROR" } },
      { status: 500 },
    );
  }
}

function sanitizeReturnTo(value: string | null | undefined): string {
  const fallback = "/provider/settings/sales/yoco-integration?from=app";
  if (!value?.trim()) return fallback;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return fallback;
  try {
    const parsed = new URL(trimmed, "https://beautonomi.local");
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
