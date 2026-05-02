import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_INTEGRATIONS_DEV } from "@/lib/admin-sections";
import { resolveAdminTenantContext, fetchScopedSingle } from "@/lib/tenant/scoped-overrides";
import { slackListChannels } from "@/lib/integrations/slack/slack-api";

function parseEnv(s: string | null): "production" | "staging" | "development" {
  if (s === "staging" || s === "development") return s;
  return "production";
}

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_INTEGRATIONS_DEV, request);
    const { searchParams } = new URL(request.url);
    const environment = parseEnv(searchParams.get("environment"));

    const supabase = getSupabaseAdmin();
    const { currentTenantId, requestedScope } = await resolveAdminTenantContext(
      request,
      undefined,
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
    if (!token) {
      return successResponse({ channels: [], message: "Slack not connected for this environment." });
    }

    const channels: { id: string; name: string; is_private?: boolean }[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 10; i++) {
      const page = await slackListChannels({ token, cursor });
      if (!page.ok) break;
      for (const c of page.channels ?? []) {
        if (c.id && (c.name || c.is_private !== undefined)) {
          channels.push({
            id: c.id,
            name: c.name || c.id,
            is_private: c.is_private,
          });
        }
      }
      cursor = page.response_metadata?.next_cursor;
      if (!cursor) break;
    }

    channels.sort((a, b) => a.name.localeCompare(b.name));
    return successResponse({ channels });
  } catch (error) {
    return handleApiError(error as Error, "Failed to list Slack channels");
  }
}
