import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";

const bodySchema = z.object({
  provider_membership_id: z.string().uuid(),
  plan_id: z.string().uuid(),
});

/**
 * POST /api/me/membership/change-plan
 * Schedule a salon membership plan change at period end (no proration).
 * Same plan_id clears any pending schedule.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request,
    );
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return errorResponse(parsed.error.message, "VALIDATION_ERROR", 400);
    }

    const { provider_membership_id, plan_id } = parsed.data;
    const { data: membership, error: findErr } = await supabase
      .from("user_memberships")
      .select(
        "id, user_id, provider_id, plan_id, status, auto_renew, expires_at, next_billing_at, scheduled_plan_id, scheduled_change_at, provider:providers(id, tenant_id)",
      )
      .eq("id", provider_membership_id)
      .eq("user_id", user.id)
      .in("status", ["active", "past_due", "paused"])
      .maybeSingle();
    if (findErr) throw findErr;

    const provider = Array.isArray((membership as { provider?: unknown })?.provider)
      ? (membership as { provider?: Array<{ tenant_id?: string; id?: string }> }).provider?.[0]
      : (membership as { provider?: { tenant_id?: string; id?: string } | null })?.provider;

    if (!membership || (provider?.tenant_id && provider.tenant_id !== tenantId)) {
      return errorResponse("Membership not found", "NOT_FOUND", 404);
    }

    const row = membership as {
      plan_id: string;
      provider_id: string;
      auto_renew?: boolean;
      expires_at?: string | null;
      next_billing_at?: string | null;
    };

    if (plan_id === row.plan_id) {
      const { error: clearErr } = await supabase
        .from("user_memberships")
        .update({
          scheduled_plan_id: null,
          scheduled_change_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", provider_membership_id)
        .eq("user_id", user.id);
      if (clearErr) throw clearErr;
      return successResponse({
        scheduled: false,
        cleared: true,
        plan_id: row.plan_id,
        scheduled_plan_id: null,
        scheduled_change_at: null,
      });
    }

    if (row.auto_renew !== true) {
      return errorResponse(
        "Turn on auto-renew before scheduling a plan change. The new plan applies at the next renewal.",
        "AUTO_RENEW_REQUIRED",
        409,
      );
    }

    const { data: plan, error: planErr } = await supabase
      .from("membership_plans")
      .select("id, provider_id, is_active, name")
      .eq("id", plan_id)
      .maybeSingle();
    if (planErr) throw planErr;
    const nextPlan = plan as { id: string; provider_id: string; is_active?: boolean; name?: string } | null;
    if (!nextPlan || nextPlan.provider_id !== row.provider_id || nextPlan.is_active === false) {
      return errorResponse("Plan is not available for this provider", "INVALID_PLAN", 400);
    }

    const changeAt = row.expires_at || row.next_billing_at;
    if (!changeAt) {
      return errorResponse(
        "This membership has no period end date to schedule a change against",
        "NO_PERIOD_END",
        409,
      );
    }

    const { error: updErr } = await supabase
      .from("user_memberships")
      .update({
        scheduled_plan_id: nextPlan.id,
        scheduled_change_at: changeAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", provider_membership_id)
      .eq("user_id", user.id);
    if (updErr) throw updErr;

    return successResponse({
      scheduled: true,
      cleared: false,
      plan_id: row.plan_id,
      scheduled_plan_id: nextPlan.id,
      scheduled_plan_name: nextPlan.name ?? null,
      scheduled_change_at: changeAt,
    });
  } catch (err) {
    return handleApiError(err, "Failed to schedule membership plan change");
  }
}
