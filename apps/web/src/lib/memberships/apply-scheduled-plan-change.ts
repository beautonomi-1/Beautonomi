/**
 * Apply a scheduled salon membership plan change (no proration).
 * Called by the renewals cron immediately before the renewal charge so the
 * new plan's price is what gets billed.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type ApplyScheduledMembershipPlanChangeResult = {
  applied: boolean;
  planId: string;
  previousPlanId: string | null;
};

/**
 * If `scheduled_plan_id` is set and `scheduled_change_at` is due (or null with
 * a due renewal), switch `plan_id` and clear the schedule.
 */
export async function applyScheduledMembershipPlanChange(
  supabase: SupabaseClient,
  membershipId: string,
  now: Date = new Date(),
): Promise<ApplyScheduledMembershipPlanChangeResult | { applied: false; planId: string; previousPlanId: null; reason: string }> {
  const { data: row, error } = await supabase
    .from("user_memberships")
    .select("id, plan_id, provider_id, scheduled_plan_id, scheduled_change_at")
    .eq("id", membershipId)
    .maybeSingle();

  if (error) throw error;
  const membership = row as {
    id: string;
    plan_id: string;
    provider_id: string;
    scheduled_plan_id?: string | null;
    scheduled_change_at?: string | null;
  } | null;

  if (!membership) {
    return { applied: false, planId: "", previousPlanId: null, reason: "not_found" };
  }
  if (!membership.scheduled_plan_id) {
    return { applied: false, planId: membership.plan_id, previousPlanId: null, reason: "no_schedule" };
  }

  const changeAt = membership.scheduled_change_at ? new Date(membership.scheduled_change_at) : null;
  if (changeAt && Number.isFinite(changeAt.getTime()) && changeAt.getTime() > now.getTime()) {
    return { applied: false, planId: membership.plan_id, previousPlanId: null, reason: "not_due" };
  }

  const { data: plan, error: planErr } = await supabase
    .from("membership_plans")
    .select("id, provider_id, is_active")
    .eq("id", membership.scheduled_plan_id)
    .maybeSingle();
  if (planErr) throw planErr;
  const nextPlan = plan as { id: string; provider_id: string; is_active?: boolean } | null;
  if (!nextPlan || nextPlan.provider_id !== membership.provider_id || nextPlan.is_active === false) {
    return { applied: false, planId: membership.plan_id, previousPlanId: null, reason: "invalid_plan" };
  }

  const previousPlanId = membership.plan_id;
  const nowIso = now.toISOString();
  const { error: updErr } = await supabase
    .from("user_memberships")
    .update({
      plan_id: nextPlan.id,
      scheduled_plan_id: null,
      scheduled_change_at: null,
      updated_at: nowIso,
    })
    .eq("id", membershipId);
  if (updErr) throw updErr;

  return { applied: true, planId: nextPlan.id, previousPlanId };
}
