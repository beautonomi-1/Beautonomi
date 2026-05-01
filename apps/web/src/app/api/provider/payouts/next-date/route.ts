import { NextRequest } from "next/server";
import { addDays, addMonths, startOfMonth } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { fetchScopedSingle } from "@/lib/tenant/scoped-overrides";
import {
  addOneDayYmd,
  dateRangeBoundsUtc,
  formatDateYmd,
  getDayInTz,
  resolveTz,
} from "@/lib/dates/provider-tz";

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
      .select("tenant_id, timezone")
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

    const tz = resolveTz((prow as { timezone?: string | null } | null)?.timezone);
    const now = new Date();
    const todayYmd = formatDateYmd(now, tz);
    let nextPayoutYmd: string | null = null;
    let description: string;

    if (schedule === "daily") {
      nextPayoutYmd = addOneDayYmd(todayYmd);
      description = "Payouts can be processed daily. Request from Finance when your balance is available.";
    } else if (schedule === "weekly") {
      const targetDow = 2;
      const todayDow = getDayInTz(now, tz);
      let daysUntilNext = (targetDow - todayDow + 7) % 7;
      if (daysUntilNext === 0) daysUntilNext = 7;
      const { fromIso } = dateRangeBoundsUtc(todayYmd, todayYmd, tz);
      nextPayoutYmd = formatDateYmd(addDays(new Date(fromIso), daysUntilNext), tz);
      description = "Payouts typically run weekly. Request from Finance when your balance is available.";
    } else {
      const zNow = toZonedTime(now, tz);
      nextPayoutYmd = formatDateYmd(startOfMonth(addMonths(zNow, 1)), tz);
      description = "Payouts typically run monthly. Request from Finance when your balance is available.";
    }

    return successResponse({
      payout_schedule: schedule,
      minimum_payout_amount: minimum,
      payout_hold_days: holdDays,
      next_payout_date: nextPayoutYmd,
      next_payout_description: description,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch payout schedule");
  }
}
