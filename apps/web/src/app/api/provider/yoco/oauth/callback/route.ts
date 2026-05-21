import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  exchangeCodeForToken,
  resolveOauthApp,
  upsertProviderTokens,
  YocoOAuthRequired,
} from "@/lib/payments/yoco-oauth";
import { getYocoEndpoints, type YocoEnvironment } from "@/lib/payments/yoco";

/**
 * GET /api/provider/yoco/oauth/callback
 *
 * Yoco redirects the browser here after authorization. We:
 *   1) Validate the CSRF `state` against `yoco_oauth_states` (single-use, TTL).
 *   2) Exchange the authorization code for access + refresh tokens.
 *   3) Store the tokens in `provider_yoco_oauth_tokens` via the service role
 *      client (the user's Supabase cookie is unreliable across a cross-site
 *      redirect, and the RLS policies on the OAuth token table are
 *      deliberately strict).
 *   4) Mark the integration row as `credential_mode = 'oauth'`, `is_enabled =
 *      true`, and set `connected_date` so the UI shows "Connected" without an
 *      extra round-trip.
 *
 * NOTE: We deliberately do NOT call requireRole here — the cookie may not be
 * present after the IdP redirect on some mobile browsers. The `state` token
 * binds this callback to the originating provider; that is the auth boundary.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const stateRaw = url.searchParams.get("state");
  const errParam = url.searchParams.get("error");
  const errDesc = url.searchParams.get("error_description");

  const supabase = getSupabaseAdmin();

  // Try to discover the original return path from the state row before we
  // delete it, so errors land back on Payment Settings even after a failure.
  let stateRow: {
    state: string;
    provider_id: string;
    tenant_id: string | null;
    environment: string;
    return_to: string | null;
    expires_at: string;
  } | null = null;
  if (stateRaw) {
    const { data } = await (supabase.from("yoco_oauth_states") as any)
      .select("state, provider_id, tenant_id, environment, return_to, expires_at")
      .eq("state", stateRaw)
      .maybeSingle();
    stateRow = (data as typeof stateRow) ?? null;
  }

  const fallbackReturn = "/provider/settings/sales/yoco-integration";
  const returnTo = sanitizeReturnTo(stateRow?.return_to || fallbackReturn);

  // Always delete the state row once we've looked it up — single-use.
  if (stateRow) {
    await (supabase.from("yoco_oauth_states") as any).delete().eq("state", stateRow.state);
  }

  // Surface any error the IdP forwarded.
  if (errParam) {
    return redirectWithFlag(origin, returnTo, "yoco_error", errDesc || errParam);
  }
  if (!code || !stateRaw) {
    return redirectWithFlag(origin, returnTo, "yoco_error", "missing_code_or_state");
  }
  if (!stateRow) {
    return redirectWithFlag(origin, returnTo, "yoco_error", "invalid_state");
  }
  if (Date.parse(stateRow.expires_at) < Date.now()) {
    return redirectWithFlag(origin, returnTo, "yoco_error", "state_expired_please_retry");
  }

  const environment: YocoEnvironment = stateRow.environment === "sandbox" ? "sandbox" : "live";

  try {
    const app = await resolveOauthApp(stateRow.tenant_id, environment);
    const token = await exchangeCodeForToken({ code, app });
    await upsertProviderTokens({
      providerId: stateRow.provider_id,
      tenantId: stateRow.tenant_id,
      environment,
      token,
    });

    // Flip the integration row to OAuth mode. Never overwrite a stored
    // secret_key — providers may want to keep it for Checkout-API-only
    // workflows alongside OAuth Web POS.
    const now = new Date().toISOString();
    const { data: existing } = await (supabase.from("provider_yoco_integrations") as any)
      .select("connected_date, secret_key, public_key")
      .eq("provider_id", stateRow.provider_id)
      .maybeSingle();

    const existingRow = existing as {
      connected_date?: string | null;
      secret_key?: string | null;
      public_key?: string | null;
    } | null;

    await (supabase.from("provider_yoco_integrations") as any).upsert(
      {
        provider_id: stateRow.provider_id,
        credential_mode: "oauth",
        environment,
        is_enabled: true,
        connected_date: existingRow?.connected_date || now,
        last_sync: now,
        updated_at: now,
      },
      { onConflict: "provider_id" }
    );

    // Best-effort: register a webhook subscription so Yoco delivers payment
    // events back to /api/provider/yoco/webhook. We never block the user-
    // facing redirect on this — providers can also manually configure
    // webhooks in the Yoco dashboard.
    try {
      await registerWebhookSubscription({
        providerId: stateRow.provider_id,
        environment,
        accessToken: token.access_token,
        callbackUrl: `${origin}/api/provider/yoco/webhook`,
      });
    } catch (whErr) {
      console.warn(
        "Yoco OAuth: webhook auto-subscription failed (provider can add it manually):",
        whErr
      );
    }

    return redirectWithFlag(origin, returnTo, "yoco_connected", "1");
  } catch (error) {
    const message =
      error instanceof YocoOAuthRequired
        ? error.message
        : error instanceof Error
          ? error.message
          : "callback_failed";
    console.error("Yoco OAuth callback error:", error);
    return redirectWithFlag(origin, returnTo, "yoco_error", message);
  }
}

/**
 * Build an absolute redirect URL by joining `returnTo` against the request
 * origin (when it's not already absolute) so NextResponse.redirect — which
 * requires a fully-qualified URL — works for both web and mobile flows.
 * `returnTo` may already include its own querystring; we preserve it.
 */
function redirectWithFlag(origin: string, returnTo: string, key: string, value: string) {
  const dest = new URL(sanitizeReturnTo(returnTo), origin);
  dest.searchParams.set(key, value);
  return NextResponse.redirect(dest.toString(), { status: 303 });
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

/**
 * Register a Yoco webhook subscription on behalf of this provider so payment
 * events flow back to /api/provider/yoco/webhook. Saves the returned
 * `webhook_id` and `secret` into `provider_yoco_webhooks` for signature
 * verification.
 *
 * Yoco's API:
 * https://yoco.docs.buildwithfern.com/api-reference/yoco-api/webhooks/create-webhook-subscription-v-1-webhooks-subscriptions-post
 */
async function registerWebhookSubscription(args: {
  providerId: string;
  environment: YocoEnvironment;
  accessToken: string;
  callbackUrl: string;
}): Promise<void> {
  const endpoints = getYocoEndpoints(args.environment);
  const supabase = getSupabaseAdmin();

  // Idempotency: if a row already matches this provider/environment/callback URL,
  // don't double-register. Stale rows for an old deploy URL should not block
  // registration for the current callback URL.
  const { data: existing } = await (supabase.from("provider_yoco_webhooks") as any)
    .select("webhook_id")
    .eq("provider_id", args.providerId)
    .eq("environment", args.environment)
    .eq("callback_url", args.callbackUrl)
    .limit(1)
    .maybeSingle();
  if (existing) return;

  const body = {
    name: "beautonomi-default",
    notification_url: args.callbackUrl,
    event_types: ["payment.created", "payment.refunded"],
  };

  const res = await fetch(endpoints.createWebhookSub, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Yoco webhook subscription failed (${res.status}): ${text}`);
  }
  const json = (await res.json()) as { id?: string; secret?: string };
  if (!json.id || !json.secret) {
    throw new Error("Yoco webhook subscription response missing id or secret");
  }

  await (supabase.from("provider_yoco_webhooks") as any).insert({
    provider_id: args.providerId,
    webhook_id: json.id,
    webhook_secret: json.secret,
    environment: args.environment,
    callback_url: args.callbackUrl,
    created_at: new Date().toISOString(),
  });
}
