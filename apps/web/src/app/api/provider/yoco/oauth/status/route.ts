import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, getProviderIdForUser } from "@/lib/supabase/api-helpers";
import { resolveProviderCredentialMode } from "@/lib/payments/yoco-oauth";
import { requireYocoPlatformEnabledForProvider } from "@/lib/payments/yoco-feature-gate";

/**
 * GET /api/provider/yoco/oauth/status
 *
 * Returns the OAuth connection status for the active provider. Used by the
 * settings UI to render the green "Connected" badge with business name +
 * token expiry without exposing the access_token itself.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff"],
      request,
    );
    const supabase = await getSupabaseServer(request);

    const providerId = await getProviderIdForUser(user.id, supabase, { request });
    if (!providerId) {
      return NextResponse.json(
        { data: null, error: { message: "Provider not found", code: "PROVIDER_NOT_FOUND" } },
        { status: 404 },
      );
    }
    const yocoGate = await requireYocoPlatformEnabledForProvider(supabase, providerId);
    if (yocoGate) return yocoGate;

    const mode = await resolveProviderCredentialMode(providerId);

    const admin = getSupabaseAdmin();
    const { data: tokenRow } = await (admin
      .from("provider_yoco_oauth_tokens") as any)
      .select(
        "environment, scope, expires_at, refresh_expires_at, business_id, business_name, user_email, last_refreshed_at, last_refresh_error, created_at, updated_at",
      )
      .eq("provider_id", providerId)
      .eq("environment", mode.environment)
      .maybeSingle();

    const row = tokenRow as
      | {
          environment?: string;
          scope?: string | null;
          expires_at?: string;
          refresh_expires_at?: string | null;
          business_id?: string | null;
          business_name?: string | null;
          user_email?: string | null;
          last_refreshed_at?: string | null;
          last_refresh_error?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      | null
      | undefined;

    return NextResponse.json({
      data: {
        credential_mode: mode.credentialMode,
        environment: mode.environment,
        is_enabled: mode.isEnabled,
        has_checkout_key: mode.hasSecretKey,
        has_oauth_token: mode.hasOauthToken,
        oauth: row
          ? {
              environment: row.environment ?? mode.environment,
              business_id: row.business_id ?? null,
              business_name: row.business_name ?? null,
              user_email: row.user_email ?? null,
              scopes: row.scope
                ? row.scope.split(/\s+/).filter(Boolean)
                : [],
              expires_at: row.expires_at ?? null,
              refresh_expires_at: row.refresh_expires_at ?? null,
              last_refreshed_at: row.last_refreshed_at ?? null,
              last_refresh_error: row.last_refresh_error ?? null,
              connected_at: row.created_at ?? null,
            }
          : null,
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
    console.error("/api/provider/yoco/oauth/status error:", error);
    return NextResponse.json(
      { data: null, error: { message: "Failed to load status", code: "INTERNAL_ERROR" } },
      { status: 500 },
    );
  }
}
