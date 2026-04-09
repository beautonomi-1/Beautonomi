import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { fetchScopedSingle } from "@/lib/tenant/scoped-overrides";

/**
 * GET /api/provider/payouts/next-date
 *
 * Returns platform payout schedule and the next payout date (informational).
 * Does not auto-create payouts; providers still request payouts manually unless a cron is added.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
    const supabase = await getSupabaseServer(request);

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return successResponse({
        payout_schedule: "weekly",
        minimum_payout_amount: 100,
        payout_hold_days: 0,
        next_payout_date: null,
        next_payout_description: "Request a payout anytime from Finance when your balance is available.",
      });
    }

    // Fetch the provider's tenant so settings are scoped correctly in a multi-tenant deployment.
    const { data: prow } = await supabase
      .from("providers")
      .select("tenant_id")
      .eq("id", providerId)
      .maybeSingle();
    const providerTenantId = (prow as { tenant_id?: string | null } | null)?.tenant_id ?? null;

    const scopedSettings = await fetchScopedSingle<Record<string, unknown>>({
      supabase: supabase as any,
      table: "platform_settings",
      tenantId: providerTenantId,
      select: "settings",
      apply: (q) => q.eq("is_active", true),
      orderBy: { column: "updated_at", ascending: false },
    });
    const payouts = ((scopedSettings.data as { settings?: Record<string, unknown> } | null)?.settings as any)?.payouts ?? {};
    const schedule = payouts.payout_schedule ?? "weekly";
    const minimum = payouts.minimum_payout_amount ?? 100;
    const holdDays = payouts.payout_hold_days ?? 0;

    const now = new Date();
    let nextDate: Date | null = null;
    let description: string;

    if (schedule === "daily") {
      nextDate = new Date(now);
      nextDate.setDate(nextDate.getDate() + 1);
      nextDate.setHours(0, 0, 0, 0);
      description = "Payouts can be processed daily. Request from Finance when your balance is available.";
    } else if (schedule === "weekly") {
      const dayOfWeek = 2;
      const daysUntilNext = (dayOfWeek - now.getDay() + 7) % 7 || 7;
      nextDate = new Date(now);
      nextDate.setDate(nextDate.getDate() + daysUntilNext);
      nextDate.setHours(0, 0, 0, 0);
      description = "Payouts typically run weekly. Request from Finance when your balance is available.";
    } else {
      nextDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      description = "Payouts typically run monthly. Request from Finance when your balance is available.";
    }

    return successResponse({
      payout_schedule: schedule,
      minimum_payout_amount: minimum,
      payout_hold_days: holdDays,
      next_payout_date: nextDate ? nextDate.toISOString().slice(0, 10) : null,
      next_payout_description: description,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch payout schedule");
  }
}
