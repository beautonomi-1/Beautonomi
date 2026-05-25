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
  type ResolvedYocoOauthApp,
} from "@/lib/payments/yoco-oauth";
import { type YocoEnvironment, getDefaultYocoEnvironment } from "@/lib/payments/yoco";
import { isFeatureEnabledServer } from "@/lib/server/feature-flags";
import { FEATURE_FLAG_KEYS } from "@/lib/server/feature-flag-keys";
import { isYocoPlatformEnabledForProvider } from "@/lib/payments/yoco-feature-gate";

/**
 * GET /api/provider/yoco/oauth/authorize
 *
 * Starts the Yoco OAuth 2.0 flow. Owner-only.
 *
 * Query params:
 *   - environment: optional override ("sandbox" | "live"); falls back to the
 *     integration row's environment, then `YOCO_ENV` env var.
 *   - return_to:   optional path the provider should land on after the callback
 *     (defaults to `/provider/settings/sales/yoco-integration`).
 *
 * Generates a single-use CSRF `state` row in `yoco_oauth_states`, then 302s
 * the browser to iam.yoco.com/oauth2/authorize. The matching `/callback` route
 * validates the state and stores the tokens.
 *
 * Errors render an inline HTML page (no JSON) so that providers who tap the
 * link from a phone get a readable explanation instead of a raw error blob.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const envParam = (url.searchParams.get("environment") || "").toLowerCase();
  const returnTo = sanitizeReturnTo(url.searchParams.get("return_to"));

  let providerId: string | null = null;
  let tenantId: string | null = null;
  let environment: YocoEnvironment = getDefaultYocoEnvironment();
  let app: ResolvedYocoOauthApp | null = null;

  try {
    const { user } = await requireRoleInApi(["provider_owner"], request);
    const supabase = await getSupabaseServer(request);
    providerId = await getProviderIdForUser(user.id, supabase, { request });
    if (!providerId) return renderError("Provider not found", returnTo, 404);

    // Prefer integration row's environment, then explicit query, then env var.
    const admin = getSupabaseAdmin();
    const yocoEnabled = await isYocoPlatformEnabledForProvider(admin, providerId);
    if (!yocoEnabled) {
      return renderError("Yoco payments are disabled for your market.", returnTo, 403);
    }
    const { data: integration } = await (admin.from("provider_yoco_integrations") as any)
      .select("environment, tenant_id")
      .eq("provider_id", providerId)
      .maybeSingle();

    const integrationRow = integration as {
      environment?: string;
      tenant_id?: string | null;
    } | null;

    if (envParam === "sandbox" || envParam === "live") {
      environment = envParam;
    } else if (
      integrationRow?.environment === "sandbox" ||
      integrationRow?.environment === "live"
    ) {
      environment = integrationRow.environment;
    }

    // Tenant resolution falls back to whatever the host resolves to.
    tenantId = integrationRow?.tenant_id ?? (await resolveTenantIdWithZaFallback(request)) ?? null;

    // §Yoco-OAuth 2026-05: gate the OAuth flow behind the rollout flag. When
    // disabled (default), refuse to mint a state row so accidental clicks
    // (e.g. from a stale UI) can't kick off a real OAuth handshake.
    const oauthEnabled = await isFeatureEnabledServer(FEATURE_FLAG_KEYS.YOCO_OAUTH_V2, tenantId);
    if (!oauthEnabled) {
      return renderError(
        "Yoco Web POS (OAuth) is not yet enabled for your account. Please use the Checkout API keys flow, or contact support to be added to the pilot.",
        returnTo,
        503
      );
    }

    app = await resolveOauthApp(tenantId, environment);
  } catch (error: any) {
    if (error instanceof YocoOAuthRequired) {
      return renderError(error.message, returnTo, 503);
    }
    const msg = error?.message ?? "";
    if (msg === "Authentication required" || msg.startsWith("Insufficient permissions")) {
      const signIn = new URL("/signin", url.origin);
      signIn.searchParams.set("redirectedFrom", url.pathname + url.search);
      return NextResponse.redirect(signIn.toString());
    }
    console.error("/api/provider/yoco/oauth/authorize error:", error);
    return renderError("Could not start the Yoco connection. Please try again.", returnTo, 500);
  }

  // Mint a CSRF state row. The redirect URI must match what is registered with
  // Yoco for this OAuth app. We use the configured redirect_uri from the app
  // record so the value cannot be tampered with via the request.
  const state = generateState();
  const admin = getSupabaseAdmin();
  const { error: stateError } = await (admin.from("yoco_oauth_states") as any).insert({
    state,
    provider_id: providerId,
    tenant_id: tenantId,
    environment,
    return_to: returnTo,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  });
  if (stateError) {
    console.error("Failed to write yoco_oauth_states row:", stateError);
    return renderError("Could not start the Yoco connection. Please try again.", returnTo, 500);
  }

  const authorizeUrl = buildAuthorizeUrl({ app, state });
  return NextResponse.redirect(authorizeUrl);
}

function renderError(message: string, returnTo: string, status: number) {
  const safeMessage = String(message).replace(/[<>&]/g, (c) =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;"
  );
  const safeReturn = String(returnTo).replace(/[<>&"]/g, (c) =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&amp;"
  );
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Connect Yoco</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
       margin:0;padding:24px;background:#f8fafc;color:#0f172a}
  .card{max-width:480px;margin:48px auto;padding:24px;background:#fff;
        border-radius:16px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
  h1{font-size:20px;margin:0 0 12px}
  p{margin:0 0 16px;line-height:1.5;color:#475569}
  a.btn{display:inline-block;padding:10px 16px;background:#6366f1;color:#fff;
        border-radius:8px;text-decoration:none;font-weight:500}
</style></head><body>
<div class="card">
  <h1>Could not start the Yoco connection</h1>
  <p>${safeMessage}</p>
  <p><a class="btn" href="${safeReturn}">Back to Payment Settings</a></p>
</div></body></html>`;
  return new NextResponse(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function sanitizeReturnTo(value: string | null): string {
  const fallback = "/provider/settings/sales/yoco-integration";
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
