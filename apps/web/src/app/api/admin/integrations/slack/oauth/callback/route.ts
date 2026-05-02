import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_INTEGRATIONS_DEV } from "@/lib/admin-sections";
import { slackOAuthV2Access } from "@/lib/integrations/slack/slack-api";
import { verifySlackOAuthState } from "@/lib/integrations/slack/oauth-state";
import { mergeSlackRouting } from "@/lib/integrations/slack/default-routing";

/**
 * Slack redirects here after authorization. Exchanges code for bot token and stores workspace metadata.
 */
export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin;
  const adminReturn = `${origin}/admin/integrations/slack`;

  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const stateRaw = searchParams.get("state");
    const err = searchParams.get("error");

    if (err) {
      return NextResponse.redirect(`${adminReturn}?slack_error=${encodeURIComponent(err)}`);
    }
    if (!code || !stateRaw) {
      return NextResponse.redirect(`${adminReturn}?slack_error=missing_code`);
    }

    const state = verifySlackOAuthState(stateRaw);
    if (!state) {
      return NextResponse.redirect(`${adminReturn}?slack_error=invalid_state`);
    }

    const { user } = await requireAdminSection(ADMIN_SECTION_INTEGRATIONS_DEV, request);
    if (user.id !== state.userId) {
      return NextResponse.redirect(`${adminReturn}?slack_error=invalid_state`);
    }

    const clientId = process.env.SLACK_CLIENT_ID;
    const clientSecret = process.env.SLACK_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return NextResponse.redirect(`${adminReturn}?slack_error=server_not_configured`);
    }

    const redirectUri = `${origin}/api/admin/integrations/slack/oauth/callback`;
    const tokenRes = await slackOAuthV2Access({
      clientId,
      clientSecret,
      code,
      redirectUri,
    });

    if (!tokenRes.ok || !tokenRes.access_token) {
      return NextResponse.redirect(
        `${adminReturn}?slack_error=${encodeURIComponent(tokenRes.error || "oauth_failed")}`
      );
    }

    const supabase = getSupabaseAdmin();
    const routing = mergeSlackRouting({});

    const payload = {
      tenant_id: state.tenantId,
      environment: state.environment,
      enabled: true,
      team_id: tokenRes.team?.id ?? null,
      team_name: tokenRes.team?.name ?? null,
      bot_user_id: tokenRes.bot_user_id ?? null,
      bot_token_secret: tokenRes.access_token,
      installed_by: state.userId,
      installed_at: new Date().toISOString(),
      routing,
      updated_at: new Date().toISOString(),
    };

    const { data: existing } = await supabase
      .from("slack_integration_config")
      .select("id, routing")
      .eq("tenant_id", state.tenantId)
      .eq("environment", state.environment)
      .maybeSingle();

    if (existing?.id) {
      const mergedRouting = mergeSlackRouting((existing as { routing?: unknown }).routing);
      const { error } = await supabase
        .from("slack_integration_config")
        .update({
          ...payload,
          routing: mergedRouting,
        })
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("slack_integration_config").insert(payload);
      if (error) throw error;
    }

    return NextResponse.redirect(`${adminReturn}?slack_connected=1`);
  } catch {
    return NextResponse.redirect(`${adminReturn}?slack_error=callback_failed`);
  }
}
