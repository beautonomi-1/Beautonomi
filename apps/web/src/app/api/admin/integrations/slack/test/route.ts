import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_INTEGRATIONS_DEV } from "@/lib/admin-sections";
import { resolveAdminTenantContext, fetchScopedSingle } from "@/lib/tenant/scoped-overrides";
import { slackChatPostMessage } from "@/lib/integrations/slack/slack-api";

function parseEnv(s: string | null): "production" | "staging" | "development" {
  if (s === "staging" || s === "development") return s;
  return "production";
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_INTEGRATIONS_DEV, request);
    const body = await request.json();
    const environment = parseEnv(typeof body.environment === "string" ? body.environment : null);
    const channelId = typeof body.channel_id === "string" ? body.channel_id.trim() : "";
    const text =
      typeof body.message === "string" && body.message.trim()
        ? body.message.trim()
        : "Beautonomi Slack test — integration is working.";
    if (!channelId) return errorResponse("channel_id is required", "VALIDATION_ERROR", 400);

    const supabase = getSupabaseAdmin();
    const { currentTenantId, requestedScope } = await resolveAdminTenantContext(
      request,
      body as Record<string, unknown>,
      user.role ?? null
    );
    const readTenantId = requestedScope.scope === "global" ? "" : requestedScope.tenantId ?? currentTenantId;

    const scoped = await fetchScopedSingle<{ bot_token_secret?: string | null }>({
      supabase,
      table: "slack_integration_config",
      tenantId: readTenantId,
      select: "bot_token_secret",
      apply: (q) => q.eq("environment", environment),
      orderBy: { column: "updated_at", ascending: false },
    });

    const token = scoped.data?.bot_token_secret;
    if (!token) return errorResponse("Slack is not connected", "SLACK_NOT_CONNECTED", 400);

    const post = await slackChatPostMessage({ token, channel: channelId, text });
    if (!post.ok) return errorResponse(post.error || "chat.postMessage failed", "SLACK_POST_FAILED", 502);

    return successResponse({ ok: true, ts: post.ts });
  } catch (error) {
    return handleApiError(error as Error, "Failed to send Slack test message");
  }
}
