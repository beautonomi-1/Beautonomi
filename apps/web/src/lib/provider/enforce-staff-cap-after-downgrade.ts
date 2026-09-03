import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { insertNotification } from "@/lib/notifications/insert-notification";
import { syncPortalRoleAfterWorkplaceChange } from "@/lib/auth/effective-provider-role";

export const STAFF_OVER_CAP_GRACE_DAYS = 7;

export type EnforceStaffCapResult = {
  providerId: string;
  limit: number | null;
  activeBefore: number;
  deactivatedStaffIds: string[];
  graceUntil: string | null;
  ownerNotified: boolean;
};

type StaffRow = {
  id: string;
  role: string | null;
  user_id: string | null;
  created_at: string | null;
  name?: string | null;
};

/**
 * Pick which active staff to deactivate when over cap: most recently added,
 * never owners. Pure and unit-tested.
 */
export function selectStaffToDeactivateOverCap(
  activeStaff: StaffRow[],
  limit: number,
): StaffRow[] {
  const excess = activeStaff.length - limit;
  if (excess <= 0) return [];
  const candidates = activeStaff
    .filter((s) => s.role !== "owner")
    .sort((a, b) => {
      const at = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bt = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bt - at; // newest first
    });
  return candidates.slice(0, excess);
}

/**
 * Plan downgrade over cap: deactivate the newest non-owner staff so the
 * active count matches the new plan limit, stamp `over_cap_grace_until`
 * (7 days) so the UI can show the grace banner and let the owner choose who
 * stays, and notify the owner. Idempotent — running again when already under
 * cap does nothing.
 *
 * Call site: subscription downgrade apply path (scheduled downgrades in
 * `GET /api/cron/expire-cancelled-subscriptions` step 0a, and the immediate
 * downgrade branch of `POST /api/provider/subscription/upgrade`). Use
 * `enforceStaffCapForProviderPlan(providerId)` when the caller does not know
 * the new limit — it reads the current plan via `can_provider_add_staff`.
 */
export async function enforceStaffCapAfterDowngrade(
  providerId: string,
  newPlanLimit: number | null,
  options: { admin?: SupabaseClient; now?: Date } = {},
): Promise<EnforceStaffCapResult> {
  const admin = options.admin ?? getSupabaseAdmin();
  const now = options.now ?? new Date();

  const { data: staffRows, error } = await admin
    .from("provider_staff")
    .select("id, role, user_id, created_at, name")
    .eq("provider_id", providerId)
    .eq("is_active", true)
    .is("deleted_at", null);
  if (error) throw error;

  const active = (staffRows ?? []) as StaffRow[];
  const base: EnforceStaffCapResult = {
    providerId,
    limit: newPlanLimit,
    activeBefore: active.length,
    deactivatedStaffIds: [],
    graceUntil: null,
    ownerNotified: false,
  };

  if (newPlanLimit == null || active.length <= newPlanLimit) {
    return base;
  }

  const toDeactivate = selectStaffToDeactivateOverCap(active, newPlanLimit);
  if (toDeactivate.length === 0) return base;

  const graceUntil = new Date(now.getTime() + STAFF_OVER_CAP_GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const ids = toDeactivate.map((s) => s.id);

  const { error: updErr } = await admin
    .from("provider_staff")
    .update({ is_active: false, over_cap_grace_until: graceUntil })
    .in("id", ids)
    .eq("provider_id", providerId);
  if (updErr) throw updErr;

  for (const s of toDeactivate) {
    if (s.user_id) {
      await syncPortalRoleAfterWorkplaceChange(s.user_id).catch(() => undefined);
    }
  }

  let ownerNotified = false;
  const { data: provider } = await admin
    .from("providers")
    .select("user_id, business_name")
    .eq("id", providerId)
    .maybeSingle();
  const ownerUserId = (provider as { user_id?: string | null } | null)?.user_id ?? null;
  if (ownerUserId) {
    const names = toDeactivate.map((s) => s.name || "Team member").join(", ");
    await insertNotification({
      user_id: ownerUserId,
      type: "system",
      title: "Team members over your plan limit",
      message: `${toDeactivate.length} team member(s) were deactivated because your plan allows ${newPlanLimit} active staff (${names}). Choose who stays before ${graceUntil.slice(0, 10)} — invites are paused until you are under the limit.`,
      action_url: "/provider/staff",
      metadata: {
        staff_event: "staff_over_cap_deactivated",
        provider_id: providerId,
        limit: newPlanLimit,
        deactivated_staff_ids: ids,
        grace_until: graceUntil,
      },
    });
    ownerNotified = true;
  }

  return {
    ...base,
    deactivatedStaffIds: ids,
    graceUntil,
    ownerNotified,
  };
}

/**
 * Convenience wrapper: reads the provider's current plan limit via the
 * `can_provider_add_staff` RPC and enforces it. Safe to call after any plan
 * change (upgrade → no-op).
 */
export async function enforceStaffCapForProviderPlan(
  providerId: string,
  options: { admin?: SupabaseClient } = {},
): Promise<EnforceStaffCapResult | null> {
  const admin = options.admin ?? getSupabaseAdmin();
  const { data, error } = await admin.rpc("can_provider_add_staff", { provider_id_param: providerId });
  if (error || !data || (Array.isArray(data) && data.length === 0)) {
    console.warn("[enforceStaffCapForProviderPlan] can_provider_add_staff failed", error?.message);
    return null;
  }
  const row = (Array.isArray(data) ? data[0] : data) as { limit_value?: number | null };
  const limit = row?.limit_value ?? null;
  return enforceStaffCapAfterDowngrade(providerId, limit, { admin });
}

/** True while active staff exceed the plan limit (invites must be blocked). */
export async function isProviderOverStaffCap(
  providerId: string,
  options: { admin?: SupabaseClient } = {},
): Promise<{ over: boolean; activeCount: number; limit: number | null }> {
  const admin = options.admin ?? getSupabaseAdmin();
  const { data, error } = await admin.rpc("can_provider_add_staff", { provider_id_param: providerId });
  if (error || !data || (Array.isArray(data) && data.length === 0)) {
    return { over: false, activeCount: 0, limit: null };
  }
  const row = (Array.isArray(data) ? data[0] : data) as {
    limit_value?: number | null;
    current_count?: number | null;
  };
  const limit = row?.limit_value ?? null;
  const activeCount = Number(row?.current_count ?? 0);
  return { over: limit != null && activeCount > limit, activeCount, limit };
}
