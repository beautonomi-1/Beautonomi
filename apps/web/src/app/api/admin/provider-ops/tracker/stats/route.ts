import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDER_OPS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_PROVIDER_OPS, request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    const stallThresholdHours = 24;
    const dropOffThresholdHours = 168;
    const now = Date.now();

    const { data: tenantUsers } = await supabase
      .from("users")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("role", "provider_owner");
    const tenantUserIds = (tenantUsers || []).map((u: { id: string }) => u.id);

    const { data: drafts, error: draftsErr } = await supabase
      .from("provider_onboarding_drafts")
      .select("user_id, current_step, updated_at")
      .in("user_id", tenantUserIds.length > 0 ? tenantUserIds : ["__none__"]);
    if (draftsErr) throw draftsErr;

    const userIds = (drafts || []).map(
      (d: { user_id: string }) => d.user_id
    );

    const { data: existingProviders } = await supabase
      .from("providers")
      .select("user_id, status")
      .eq("tenant_id", tenantId)
      .in("user_id", userIds.length > 0 ? userIds : ["__none__"]);

    const completedUserIds = new Set(
      (existingProviders || []).map(
        (p: { user_id: string }) => p.user_id
      )
    );

    const inProgress = (drafts || []).filter(
      (d: { user_id: string }) => !completedUserIds.has(d.user_id)
    );

    let totalInProgress = 0;
    let stalledCount = 0;
    let droppedOffCount = 0;
    let activeCount = 0;
    const byStep: Record<number, number> = {};

    for (const draft of inProgress) {
      const d = draft as { current_step: number; updated_at: string };
      totalInProgress++;
      const step = d.current_step || 1;
      byStep[step] = (byStep[step] || 0) + 1;

      const diff = now - new Date(d.updated_at).getTime();
      const hours = diff / (1000 * 60 * 60);
      if (hours > dropOffThresholdHours) droppedOffCount++;
      else if (hours > stallThresholdHours) stalledCount++;
      else activeCount++;
    }

    const { count: totalProviders } = await supabase
      .from("providers")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId);

    const { count: activeProviders } = await supabase
      .from("providers")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "active");

    const { count: pendingApproval } = await supabase
      .from("providers")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .in("status", ["draft", "pending_approval"]);

    return successResponse({
      in_progress: totalInProgress,
      stalled: stalledCount,
      dropped_off: droppedOffCount,
      active_in_wizard: activeCount,
      by_step: byStep,
      total_providers: totalProviders || 0,
      active_providers: activeProviders || 0,
      pending_approval: pendingApproval || 0,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch tracker stats");
  }
}
