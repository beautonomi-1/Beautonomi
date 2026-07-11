import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  notFoundResponse,
  getPaginationParams,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDER_OPS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminSection(ADMIN_SECTION_PROVIDER_OPS, request);
    const { id } = await params;
    const tenantId = await resolveAdminApiTenantId(request);
    const { page, limit, offset } = getPaginationParams(request);
    const supabase = getSupabaseAdmin();

    const { data: lead } = await supabase
      .from("provider_leads")
      .select("id")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!lead) return notFoundResponse("Lead not found");

    const { data, error, count } = await supabase
      .from("provider_lead_communications")
      .select("*", { count: "exact" })
      .eq("lead_id", id)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    const total = count ?? 0;
    return successResponse({
      communications: data ?? [],
      meta: { page, limit, total, has_more: total > page * limit },
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch lead communications");
  }
}
