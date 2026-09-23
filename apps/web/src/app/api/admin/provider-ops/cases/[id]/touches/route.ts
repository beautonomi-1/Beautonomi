import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  successResponse,
  errorResponse,
  handleApiError,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { requireOpsDesk, requireProviderOpsAnyDesk } from "@/lib/provider-ops/ops-desk-auth";
import { logRetentionCaseTouch, type TouchChannel } from "@/lib/provider-ops/retention-touch";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";

const CHANNELS: TouchChannel[] = ["call", "whatsapp", "email", "note"];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireProviderOpsAnyDesk(request);
    const { id: caseId } = await params;
    const tenantId = await resolveAdminApiTenantId(request);
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("provider_ops_case_touches")
      .select("id, channel, note, created_at, actor_user_id")
      .eq("case_id", caseId)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw error;
    return successResponse({ touches: data ?? [] });
  } catch (error) {
    return handleApiError(error, "Failed to load touches");
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireOpsDesk(["retention"], request);
    const { id: caseId } = await params;
    const tenantId = await resolveAdminApiTenantId(request);
    const supabase = getSupabaseAdmin();
    const body = (await request.json()) as {
      channel?: string;
      note?: string;
      follow_up_at?: string;
    };

    const channel = body.channel as TouchChannel;
    if (!channel || !CHANNELS.includes(channel)) {
      return errorResponse("Invalid channel", "VALIDATION_ERROR", 400);
    }

    const { data: exists } = await supabase
      .from("provider_ops_cases")
      .select("id")
      .eq("id", caseId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!exists) return notFoundResponse("Case not found");

    const result = await logRetentionCaseTouch(supabase, {
      tenantId,
      caseId,
      actorUserId: user.id,
      channel,
      note: body.note,
      followUpAt: body.follow_up_at,
    });

    void writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "admin.provider_ops.retention_touch",
      entity_type: "provider_ops_case",
      entity_id: caseId,
      module: "provider_ops",
      risk_level: "low",
      retention_tier: "routine",
      metadata: { channel },
      ...extractRequestMeta(request),
    });

    return successResponse(result);
  } catch (error) {
    return handleApiError(error, "Failed to log touch");
  }
}
