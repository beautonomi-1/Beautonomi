import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { requireProviderOpsManagersOnly } from "@/lib/provider-ops/ops-route-auth";
import { countOpsQuotaActual } from "@/lib/provider-ops/ops-quota-metrics";
import type { OpsDesk } from "@/lib/provider-ops/ops-desk-roles";

/**
 * GET /api/admin/provider-ops/reports/scorecard
 * Team quota attainment for the current month (managers).
 */
export async function GET(request: NextRequest) {
  try {
    await requireProviderOpsManagersOnly(request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    const periodStart = new Date();
    periodStart.setUTCDate(1);
    periodStart.setUTCHours(0, 0, 0, 0);
    const periodIso = periodStart.toISOString().slice(0, 10);

    const { data: quotas, error: qErr } = await supabase
      .from("provider_ops_quotas")
      .select("*, users:user_id(id, full_name, email)")
      .eq("tenant_id", tenantId)
      .eq("period_start", periodIso);
    if (qErr) throw qErr;

    const rows = quotas ?? [];
    const scorecard = await Promise.all(
      rows.map(async (q) => {
        const userId = q.user_id as string;
        const desk = q.desk as OpsDesk;
        const metric = q.metric as string;

        const actual = await countOpsQuotaActual(supabase, {
          tenantId,
          userId,
          desk,
          metric,
          periodStart,
        });

        const user = q.users as { full_name: string | null; email: string | null } | null;
        return {
          user_id: userId,
          label: user?.full_name?.trim() || user?.email || userId.slice(0, 8),
          desk,
          metric,
          target: q.target as number,
          actual,
        };
      }),
    );

    return successResponse({ period_start: periodIso, rows: scorecard });
  } catch (error) {
    return handleApiError(error, "Failed to load scorecard");
  }
}
