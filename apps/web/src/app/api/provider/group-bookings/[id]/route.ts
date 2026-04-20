import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError } from "@/lib/supabase/api-helpers";

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
