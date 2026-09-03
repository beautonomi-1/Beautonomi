import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { reassignFutureBookingsForStaff } from "@/lib/provider/find-future-bookings-for-staff";
import { reassignStaffEarningsLines } from "@/lib/payroll/reassign-staff-earnings-lines";
import { notifyStaffUser } from "@/lib/notifications/notify-staff-event";

export type ReassignStaffWorkloadResult =
  | { ok: true; toStaffId: string; bookingIds: string[]; bookingServiceIds: string[] }
  | { ok: false; code: "TARGET_NOT_FOUND" | "TARGET_INACTIVE" | "SAME_STAFF"; message: string };

/**
 * Resolve the `reassign_to` value ("any" or a staff id) to an active staff
 * member of the provider (never the staff being removed).
 */
export async function resolveReassignTarget(
  supabase: SupabaseClient,
  providerId: string,
  fromStaffId: string,
  reassignTo: string,
): Promise<{ id: string } | null> {
  if (reassignTo === "any") {
    const { data } = await supabase
      .from("provider_staff")
      .select("id")
      .eq("provider_id", providerId)
      .eq("is_active", true)
      .is("deleted_at", null)
      .neq("id", fromStaffId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    return (data as { id: string } | null) ?? null;
  }
  const { data } = await supabase
    .from("provider_staff")
    .select("id, is_active, deleted_at")
    .eq("provider_id", providerId)
    .eq("id", reassignTo)
    .maybeSingle();
  const row = data as { id: string; is_active: boolean | null; deleted_at: string | null } | null;
  if (!row || row.deleted_at || row.is_active === false) return null;
  return { id: row.id };
}

/**
 * Deactivate/remove flow with `reassign_to`: move every future booking line
 * to the target, post earnings reversals for prepaid bookings, and notify the
 * new assignee. Used by PATCH (is_active=false) and DELETE on staff/[id].
 */
export async function reassignStaffWorkload(
  supabase: SupabaseClient,
  params: {
    providerId: string;
    fromStaffId: string;
    reassignTo: string;
    actorUserId: string;
  },
): Promise<ReassignStaffWorkloadResult> {
  if (params.reassignTo === params.fromStaffId) {
    return { ok: false, code: "SAME_STAFF", message: "Cannot reassign bookings to the same team member." };
  }
  const target = await resolveReassignTarget(supabase, params.providerId, params.fromStaffId, params.reassignTo);
  if (!target) {
    return {
      ok: false,
      code: params.reassignTo === "any" ? "TARGET_NOT_FOUND" : "TARGET_INACTIVE",
      message:
        params.reassignTo === "any"
          ? "No other active team member is available to take these bookings."
          : "The selected team member is not active for this business.",
    };
  }

  const moved = await reassignFutureBookingsForStaff(
    supabase,
    params.providerId,
    params.fromStaffId,
    target.id,
  );

  if (moved.bookingIds.length > 0) {
    const admin = getSupabaseAdmin();
    for (const bookingId of moved.bookingIds) {
      try {
        await reassignStaffEarningsLines(admin, {
          providerId: params.providerId,
          bookingId,
          fromStaffId: params.fromStaffId,
          toStaffId: target.id,
          actorUserId: params.actorUserId,
          reason: "Team member deactivated — booking reassigned",
        });
      } catch (err) {
        console.warn("[reassignStaffWorkload] earnings reassign failed:", bookingId, err);
      }
    }

    await notifyStaffUser(target.id, "staff_booking_reassigned", {
      title: "Appointments reassigned to you",
      message: `${moved.bookingIds.length} upcoming appointment(s) were reassigned to you.`,
      url: "/provider/calendar",
      metadata: { booking_ids: moved.bookingIds.slice(0, 50), from_staff_id: params.fromStaffId },
    }).catch(() => undefined);
  }

  return { ok: true, toStaffId: target.id, ...moved };
}
