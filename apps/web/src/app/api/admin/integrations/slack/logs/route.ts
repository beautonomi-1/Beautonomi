import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_INTEGRATIONS_DEV } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

function parseEnv(s: string | null): "production" | "staging" | "development" {
  if (s === "staging" || s === "development") return s;
  return "production";
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_INTEGRATIONS_DEV, request);
    const tenantId = await resolveAdminApiTenantId(request);
    const { searchParams } = new URL(request.url);
    const environment = parseEnv(searchParams.get("environment"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "40", 10) || 40));

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("slack_delivery_logs")
      .select("id, event_key, entity_type, entity_id, dedupe_key, status, channel_id, slack_ts, error_message, created_at")
      .eq("tenant_id", tenantId)
      .eq("environment", environment)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;
    return successResponse({ logs: data ?? [] });
  } catch (error) {
    return handleApiError(error as Error, "Failed to fetch Slack delivery logs");
  }
}
