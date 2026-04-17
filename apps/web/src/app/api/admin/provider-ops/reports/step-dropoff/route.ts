import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDER_OPS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { fetchAllPaged } from "@/lib/provider-ops/postgrest-unbounded";

const STEP_NAMES: Record<number, string> = {
  1: "Team Size",
  2: "Identity + OTP",
  3: "Business Details",
  4: "Payment Setup",
  5: "Current Software",
  6: "Payroll",
  7: "Location",
  8: "Photos",
  9: "Service Zones",
  10: "Categories",
  11: "Services",
  12: "Operating Hours",
  13: "Review",
  14: "Plan Selection",
};

export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_PROVIDER_OPS, request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    const stallThresholdMs = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();

    const draftsRaw = await fetchAllPaged<Record<string, unknown>>(async (from, to) => {
      const r = await supabase
        .from("provider_onboarding_drafts")
        .select("user_id, current_step, updated_at, users!inner(preferred_home_tenant_id, role)")
        .eq("users.preferred_home_tenant_id", tenantId)
        .range(from, to);
      return { data: r.data as Record<string, unknown>[] | null, error: r.error };
    });

    const drafts = draftsRaw.filter((d) => {
      const u = (d as any).users;
      const user = Array.isArray(u) ? u[0] : u;
      return user?.role === "provider_owner";
    });

    const userIds = (drafts || []).map((d) => (d as { user_id: string }).user_id);
    const { data: providers } = await supabase
      .from("providers")
      .select("user_id")
      .eq("tenant_id", tenantId)
      .in("user_id", userIds.length > 0 ? userIds : ["__none__"]);

    const completedIds = new Set(
      (providers || []).map((p: { user_id: string }) => p.user_id)
    );

    const stuckDrafts = (drafts || []).filter((d) => {
      const row = d as { user_id: string; updated_at: string };
      return (
        !completedIds.has(row.user_id) &&
        now - new Date(row.updated_at).getTime() > stallThresholdMs
      );
    });

    const stepDropoff: Record<
      number,
      { step: number; name: string; count: number }
    > = {};
    for (let s = 1; s <= 14; s++) {
      stepDropoff[s] = { step: s, name: STEP_NAMES[s], count: 0 };
    }

    for (const draft of stuckDrafts) {
      const step = (draft as { current_step: number }).current_step || 1;
      if (stepDropoff[step]) {
        stepDropoff[step].count++;
      }
    }

    const sorted = Object.values(stepDropoff).sort(
      (a, b) => b.count - a.count
    );

    return successResponse({
      total_dropped: stuckDrafts.length,
      by_step: sorted,
      worst_step: sorted[0] || null,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch step drop-off report");
  }
}
