import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDER_OPS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

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

    const { data: tenantUsers } = await supabase
      .from("users")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("role", "provider_owner");
    const tenantUserIds = (tenantUsers || []).map((u: { id: string }) => u.id);

    const { data: drafts } = await supabase
      .from("provider_onboarding_drafts")
      .select("user_id, current_step, updated_at")
      .in("user_id", tenantUserIds.length > 0 ? tenantUserIds : ["__none__"]);

    const userIds = (drafts || []).map(
      (d: { user_id: string }) => d.user_id
    );
    const { data: providers } = await supabase
      .from("providers")
      .select("user_id")
      .eq("tenant_id", tenantId)
      .in("user_id", userIds.length > 0 ? userIds : ["__none__"]);

    const completedIds = new Set(
      (providers || []).map((p: { user_id: string }) => p.user_id)
    );

    const stuckDrafts = (drafts || []).filter(
      (d: { user_id: string; updated_at: string }) =>
        !completedIds.has(d.user_id) &&
        now - new Date(d.updated_at).getTime() > stallThresholdMs
    );

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
