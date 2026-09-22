import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { requireProviderOpsSection } from "@/lib/provider-ops/ops-desk-auth";
import {
  deskForAdminRole,
  isOpsDeskManager,
  type OpsDesk,
} from "@/lib/provider-ops/ops-desk-roles";
import {
  stampFirstBookingAtIfNeeded,
} from "@/lib/provider-ops/ops-case";
import { countOpsQuotaActual } from "@/lib/provider-ops/ops-quota-metrics";

function ownerColumn(desk: OpsDesk): string {
  if (desk === "sales") return "sales_owner_id";
  if (desk === "onboarding") return "onboarding_owner_id";
  return "retention_owner_id";
}

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireProviderOpsSection(request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    const manager = isOpsDeskManager(user.role);
    const desk = deskForAdminRole(user.role);
    const desks: OpsDesk[] = manager
      ? ["sales", "onboarding", "retention"]
      : desk
        ? [desk]
        : ["sales", "onboarding", "retention"];

    let casesQuery = supabase
      .from("provider_ops_cases")
      .select(
        `
        *,
        provider_leads:lead_id ( id, business_name, commercial_stage, next_follow_up_at ),
        providers:provider_id ( id, business_name, status )
      `,
      )
      .eq("tenant_id", tenantId)
      .in("current_desk", desks)
      .in("status", ["open", "activated"]);

    if (!manager && desk) {
      casesQuery = casesQuery.or(
        `${ownerColumn(desk)}.eq.${user.id},and(current_desk.eq.${desk},${ownerColumn(desk)}.is.null)`,
      );
    }

    const { data: cases, error: casesErr } = await casesQuery
      .order("updated_at", { ascending: false })
      .limit(50);
    if (casesErr) throw casesErr;

    for (const row of cases ?? []) {
      const providerId = (row as { provider_id?: string | null }).provider_id;
      if (providerId && !(row as { first_booking_at?: string | null }).first_booking_at) {
        await stampFirstBookingAtIfNeeded(supabase, (row as { id: string }).id, providerId);
      }
    }

    let handoffsQuery = supabase
      .from("provider_ops_handoffs")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(20);

    if (!manager) {
      handoffsQuery = handoffsQuery.or(`to_user_id.eq.${user.id},to_user_id.is.null`);
    }

    const { data: handoffs, error: handoffErr } = await handoffsQuery;
    if (handoffErr) throw handoffErr;

    const pendingHandoffs = manager
      ? handoffs ?? []
      : (handoffs ?? []).filter(
          (h) =>
            (h as { to_user_id?: string | null }).to_user_id === user.id ||
            (h as { to_user_id?: string | null }).to_user_id == null,
        );

    const { data: tasks, error: taskErr } = await supabase
      .from("provider_lead_tasks")
      .select("*, provider_leads:lead_id ( business_name, tenant_id )")
      .eq("assigned_to", user.id)
      .is("completed_at", null)
      .lt("due_at", new Date().toISOString())
      .order("due_at", { ascending: true })
      .limit(30);
    if (taskErr) throw taskErr;

    const overdueTasks = (tasks ?? []).filter((t) => {
      const lead = (t as { provider_leads?: { tenant_id?: string } | null }).provider_leads;
      return lead?.tenant_id === tenantId;
    });

    const periodStart = new Date();
    periodStart.setUTCDate(1);
    periodStart.setUTCHours(0, 0, 0, 0);
    const periodIso = periodStart.toISOString().slice(0, 10);

    const { data: quotas } = await supabase
      .from("provider_ops_quotas")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("user_id", user.id)
      .eq("period_start", periodIso);

    const attainment: Record<string, { target: number; actual: number }> = {};
    for (const q of quotas ?? []) {
      const metric = (q as { metric: string }).metric;
      const target = (q as { target: number }).target;
      const deskFilter = (q as { desk: OpsDesk }).desk;

      const actual = await countOpsQuotaActual(supabase, {
        tenantId,
        userId: user.id,
        desk: deskFilter,
        metric,
        periodStart,
      });
      attainment[metric] = { target, actual };
    }

    return successResponse({
      desk: manager ? null : desk,
      cases: cases ?? [],
      pending_handoffs: pendingHandoffs,
      overdue_tasks: overdueTasks,
      quota_attainment: attainment,
      period_start: periodIso,
    });
  } catch (error) {
    return handleApiError(error, "Failed to load My Day");
  }
}
