import { NextRequest } from "next/server";
import { requireAdminSection, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PLATFORM_CONFIG } from "@/lib/admin-sections";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_PLATFORM_CONFIG, request);
    const tenantId = await resolveAdminApiTenantId(request);
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const agentId = searchParams.get("agent_id");
    const supabase = getSupabaseAdmin();
    let q = supabase
      .from("agent_actions")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (status) q = q.eq("status", status);
    if (agentId) q = q.eq("agent_id", agentId);
    const { data, error } = await q;
    if (error) throw error;
    return successResponse(data ?? []);
  } catch (error) {
    return handleApiError(error as Error, "Failed to list agent actions");
  }
}
