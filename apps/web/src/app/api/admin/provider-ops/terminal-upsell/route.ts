import { requireProviderOpsRetention } from "@/lib/provider-ops/ops-route-auth";
import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  getPaginationParams,
} from "@/lib/supabase/api-helpers";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

/**
 * GET /api/admin/provider-ops/terminal-upsell
 * Provider-ops read proxy for terminal upsell pipeline (retention desk).
 */
export async function GET(request: NextRequest) {
  try {
    await requireProviderOpsRetention(request);
    const tenantId = await resolveAdminApiTenantId(request);
    const { page, limit, offset } = getPaginationParams(request);
    const supabase = getSupabaseAdmin();

    const { data, error, count } = await supabase
      .from("terminal_upsell_leads")
      .select(
        `
        id,
        provider_id,
        status,
        source,
        created_at,
        updated_at,
        providers:provider_id ( id, business_name )
      `,
        { count: "exact" },
      )
      .eq("tenant_id", tenantId)
      .order("updated_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    const total = count ?? 0;
    return successResponse({
      data: data ?? [],
      meta: { page, limit, total, has_more: total > page * limit },
    });
  } catch (error) {
    return handleApiError(error, "Failed to load terminal upsell leads");
  }
}
