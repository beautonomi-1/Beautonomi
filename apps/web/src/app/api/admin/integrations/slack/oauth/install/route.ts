import { NextRequest, NextResponse } from "next/server";
import { requireAdminSection, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_INTEGRATIONS_DEV } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { signSlackOAuthState } from "@/lib/integrations/slack/oauth-state";

const SCOPES = ["channels:read", "groups:read", "chat:write"].join(",");

function parseEnv(s: string | null): "production" | "staging" | "development" {
  if (s === "staging" || s === "development") return s;
  return "production";
}

/**
 * Redirects the browser to Slack OAuth. Must register the callback URL on the Slack app:
 * `{origin}/api/admin/integrations/slack/oauth/callback`
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_INTEGRATIONS_DEV, request);
    const tenantId = await resolveAdminApiTenantId(request);
    const { searchParams } = new URL(request.url);
    const environment = parseEnv(searchParams.get("environment"));
    const clientId = process.env.SLACK_CLIENT_ID;
    if (!clientId) {
      return NextResponse.json(
        { error: { message: "SLACK_CLIENT_ID is not configured", code: "SLACK_NOT_CONFIGURED" } },
        { status: 503 }
      );
    }

    const origin = new URL(request.url).origin;
    const redirectUri = `${origin}/api/admin/integrations/slack/oauth/callback`;

    const state = signSlackOAuthState({
      tenantId,
      environment,
      userId: user.id,
      exp: Date.now() + 15 * 60_000,
    });

    const url = new URL("https://slack.com/oauth/v2/authorize");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("scope", SCOPES);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);

    return NextResponse.redirect(url.toString());
  } catch (error) {
    return handleApiError(error as Error, "Failed to start Slack OAuth");
  }
}
