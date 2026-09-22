import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { requireProviderOpsAnyDesk } from "@/lib/provider-ops/ops-route-auth";

/**
 * GET /api/admin/provider-ops/cases/lookup?lead_id=&user_id=&provider_id=
 */
export async function GET(request: NextRequest) {
  try {
    await requireProviderOpsAnyDesk(request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const { searchParams } = new URL(request.url);
    const leadId = searchParams.get("lead_id");
    const userId = searchParams.get("user_id");
    const providerId = searchParams.get("provider_id");

    if (!leadId && !userId && !providerId) {
      return errorResponse("lead_id, user_id, or provider_id is required", "VALIDATION_ERROR", 400);
    }

    let query = supabase.from("provider_ops_cases").select("*").eq("tenant_id", tenantId);

    if (leadId) {
      query = query.eq("lead_id", leadId).in("status", ["open", "nurture", "lost"]);
    } else if (providerId) {
      query = query.eq("provider_id", providerId).in("status", ["open", "activated", "churned"]);
    } else if (userId) {
      query = query.eq("user_id", userId).in("status", ["open", "activated"]);
    }

    const { data: caseRow, error } = await query.order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;

    const ownerIds = [
      caseRow?.sales_owner_id,
      caseRow?.onboarding_owner_id,
      caseRow?.retention_owner_id,
    ].filter(Boolean) as string[];

    let owners: Record<string, { id: string; full_name: string | null; email: string | null }> = {};
    if (ownerIds.length > 0) {
      const { data: users } = await supabase
        .from("users")
        .select("id, full_name, email")
        .in("id", ownerIds);
      for (const u of users ?? []) {
        owners[u.id] = u;
      }
    }

    let pendingHandoffs: unknown[] = [];
    if (caseRow?.id) {
      const { data: handoffs } = await supabase
        .from("provider_ops_handoffs")
        .select("*")
        .eq("case_id", caseRow.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(5);
      pendingHandoffs = handoffs ?? [];
    }

    return successResponse({
      case: caseRow ?? null,
      owners,
      pending_handoffs: pendingHandoffs,
    });
  } catch (error) {
    return handleApiError(error, "Failed to lookup case");
  }
}
