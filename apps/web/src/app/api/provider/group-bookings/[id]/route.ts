import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { evaluateProviderSlotAgainstGrid } from "@/lib/provider-booking/compute-provider-slot-grid";

/**
 * GET /api/provider/group-bookings/[id]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const { id } = await params;
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: groupBooking, error } = await supabase
      .from("group_bookings")
      .select(`
        *,
        bookings:bookings(
          id, booking_number, ref_number, status, scheduled_at, total_amount,
          customer:users!bookings_customer_id_fkey(id, full_name, email, phone, avatar_url)
        )
      `)
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (error || !groupBooking) {
      return notFoundResponse("Group booking not found");
    }

    return successResponse(groupBooking);
  } catch (error) {
    return handleApiError(error, "Failed to fetch group booking");
  }
}

/**
 * PATCH /api/provider/group-bookings/[id]
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const { id } = await params;
    const body = await request.json();
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const allowedFields = [
      "title", "scheduled_at", "service_id", "staff_id", "location_id",
      "max_participants", "duration_minutes", "notes", "status",
      // §Provider-audit 2026-04 (packages round 2): allow updating the
      // service_package link so providers can attach/detach a package after
      // the group booking was created.
      "package_id",
    ];
    const sanitized: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const key of allowedFields) {
      if (key in body) sanitized[key] = body[key];
    }

    // Mobile / portal sometimes send split date+time instead of ISO `scheduled_at`.
    const scheduledDate =
      typeof body.scheduled_date === "string" ? body.scheduled_date.trim() : "";
    const scheduledTime =
      typeof body.scheduled_time === "string" ? body.scheduled_time.trim() : "";
    if (scheduledDate && scheduledTime && /^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)) {
      const hm = scheduledTime.match(/^(\d{1,2}):(\d{2})/);
      if (hm) {
        const isoLocal = `${scheduledDate}T${String(hm[1]).padStart(2, "0")}:${hm[2]}:00`;
        const parsed = new Date(isoLocal);
        if (!Number.isNaN(parsed.getTime())) {
          sanitized.scheduled_at = parsed.toISOString();
        }
      }
    }
    delete (sanitized as Record<string, unknown>).scheduled_date;
    delete (sanitized as Record<string, unknown>).scheduled_time;

    // Commit-time availability check when the slot / staff / location / duration
    // changes. Mirrors the single-booking PATCH behaviour so a provider cannot
    // silently shift a group onto a conflict.
    const movingSlot =
      "scheduled_at" in sanitized ||
      "staff_id" in sanitized ||
      "location_id" in sanitized ||
      "duration_minutes" in sanitized ||
      "service_id" in sanitized;
    const allowOverride = body?.allow_override === true;
    if (movingSlot && !allowOverride) {
      const { data: existing } = await supabase
        .from("group_bookings")
        .select("scheduled_at, duration_minutes, staff_id, location_id, service_id")
        .eq("id", id)
        .eq("provider_id", providerId)
        .maybeSingle();
      const nextScheduledAt =
        (sanitized.scheduled_at as string | undefined) ?? existing?.scheduled_at ?? null;
      const nextDuration = Number(
        (sanitized.duration_minutes as number | undefined) ?? existing?.duration_minutes ?? 60,
      );
      const nextStaff =
        (sanitized.staff_id as string | null | undefined) ??
        (existing?.staff_id as string | null | undefined) ??
        null;
      const nextLocation =
        (sanitized.location_id as string | null | undefined) ??
        (existing?.location_id as string | null | undefined) ??
        null;
      const nextService =
        (sanitized.service_id as string | null | undefined) ??
        (existing?.service_id as string | null | undefined) ??
        null;
      if (nextScheduledAt) {
        const d = new Date(nextScheduledAt);
        if (!Number.isNaN(d.getTime())) {
          const admin = getSupabaseAdmin();
          const check = await evaluateProviderSlotAgainstGrid(admin, {
            providerId,
            scheduledAt: d,
            durationMinutes: Number.isFinite(nextDuration) ? nextDuration : 60,
            staffIdsCsv: nextStaff ? String(nextStaff) : null,
            locationId: nextLocation ? String(nextLocation) : null,
            excludeBookingId: undefined,
            excludeGroupBookingId: id,
            mode: "salon",
            travelBufferRaw: null,
            minNoticeMinutes: 0,
            maxAdvanceDays: 365,
            resourceOfferingIds: nextService ? [String(nextService)] : [],
          });
          if (!check.ok) {
            return errorResponse(
              check.conflicts.join("; ") || "Slot is not available",
              "SLOT_NOT_AVAILABLE",
              409,
            );
          }
        }
      }
    }

    const { data, error } = await supabase
      .from("group_bookings")
      .update(sanitized)
      .eq("id", id)
      .eq("provider_id", providerId)
      .select()
      .single();

    if (error || !data) {
      return notFoundResponse("Group booking not found");
    }

    return successResponse(data);
  } catch (error) {
    return handleApiError(error, "Failed to update group booking");
  }
}

/**
 * DELETE /api/provider/group-bookings/[id]
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const { id } = await params;
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Fetch booking IDs before cancelling so we can trigger waitlist
    const { data: groupBookings } = await supabase
      .from("bookings")
      .select("id")
      .eq("group_booking_id", id)
      .eq("provider_id", providerId)
      .not("status", "in", "(cancelled,no_show)");

    // Cancel all associated bookings first
    await supabase
      .from("bookings")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("group_booking_id", id)
      .eq("provider_id", providerId);

    // Then cancel the group booking
    const { error } = await supabase
      .from("group_bookings")
      .update({ status: "cancelled" })
      .eq("id", id)
      .eq("provider_id", providerId);

    if (error) {
      throw error;
    }

    // Notify waitlist for freed slots
    if (groupBookings?.length) {
      try {
        const { matchWaitlistOnCancellation } = await import("@/lib/waitlist/matching");
        await Promise.allSettled(
          groupBookings.map((b: { id: string }) => matchWaitlistOnCancellation(supabase, b.id))
        );
      } catch (waitlistErr) {
        console.error("[provider group cancel] waitlist matching failed:", waitlistErr);
      }
    }

    return successResponse({ success: true, message: "Group booking cancelled" });
  } catch (error) {
    return handleApiError(error, "Failed to delete group booking");
  }
}
