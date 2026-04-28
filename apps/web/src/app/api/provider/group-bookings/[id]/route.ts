import { NextRequest } from "next/server";
import { addMinutes } from "date-fns";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { evaluateProviderSlotAgainstGrid } from "@/lib/provider-booking/compute-provider-slot-grid";
import { checkActiveHoldOverlap } from "@/lib/bookings/conflict-check";

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
    const admin = getSupabaseAdmin();
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: groupBooking, error } = await admin
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
    const admin = getSupabaseAdmin();
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const allowedFields = [
      "title", "scheduled_at", "service_id", "staff_id", "location_id",
      "max_participants", "duration_minutes", "notes", "status",
      "location_type", "address_line1", "address_city", "address_state",
      "address_country", "address_postal_code", "address_latitude",
      "address_longitude", "address_place_name", "travel_fee", "products",
      "total_price",
      // §Provider-audit 2026-04 (packages round 2): allow updating the
      // service_package link so providers can attach/detach a package after
      // the group booking was created.
      "package_id",
    ];
    const sanitized: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const key of allowedFields) {
      if (key in body) sanitized[key] = body[key];
    }
    if (sanitized.location_type === "at_home") {
      sanitized.location_id = null;
      sanitized.travel_fee = Math.max(0, Number(sanitized.travel_fee || 0));
    } else if (sanitized.location_type === "at_salon") {
      sanitized.address_line1 = null;
      sanitized.address_city = null;
      sanitized.address_state = null;
      sanitized.address_country = null;
      sanitized.address_postal_code = null;
      sanitized.address_latitude = null;
      sanitized.address_longitude = null;
      sanitized.address_place_name = null;
      sanitized.travel_fee = 0;
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
      const { data: existing } = await admin
        .from("group_bookings")
        .select("scheduled_at, duration_minutes, staff_id, location_id, service_id, location_type")
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
      const nextLocationType =
        (sanitized.location_type as string | null | undefined) ??
        (existing?.location_type as string | null | undefined) ??
        "at_salon";
      if (nextScheduledAt) {
        const d = new Date(nextScheduledAt);
        if (!Number.isNaN(d.getTime())) {
          const holdEnd = addMinutes(
            d,
            (Number.isFinite(nextDuration) ? nextDuration : 60) + (nextLocationType === "at_home" ? 30 : 0),
          );
          const holdOverlap = await checkActiveHoldOverlap(admin, providerId, d, holdEnd, {
            dbStaffId: nextStaff ? String(nextStaff) : null,
          });
          if (holdOverlap) {
            return errorResponse(
              "This time slot is no longer available. Please select another time.",
              "CONFLICT",
              409,
            );
          }

          const check = await evaluateProviderSlotAgainstGrid(admin, {
            providerId,
            scheduledAt: d,
            durationMinutes: Number.isFinite(nextDuration) ? nextDuration : 60,
            staffIdsCsv: nextStaff ? String(nextStaff) : null,
            locationId: nextLocationType === "at_home" ? null : (nextLocation ? String(nextLocation) : null),
            excludeBookingId: undefined,
            excludeGroupBookingId: id,
            mode: nextLocationType === "at_home" ? "mobile" : "salon",
            travelBufferRaw: nextLocationType === "at_home" ? "30" : null,
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

    if (
      "products" in sanitized ||
      "travel_fee" in sanitized ||
      "location_type" in sanitized ||
      "total_price" in sanitized
    ) {
      const [{ data: existingTotals }, { data: participantRows }] = await Promise.all([
        admin
          .from("group_bookings")
          .select("products, travel_fee, location_type")
          .eq("id", id)
          .eq("provider_id", providerId)
          .maybeSingle(),
        admin
          .from("booking_participants")
          .select("price")
          .eq("group_booking_id", id),
      ]);
      const nextProducts = Array.isArray(sanitized.products)
        ? sanitized.products
        : Array.isArray(existingTotals?.products)
          ? existingTotals.products
          : [];
      const nextLocationType = String(
        sanitized.location_type ?? existingTotals?.location_type ?? "at_salon",
      );
      const nextTravelFee = nextLocationType === "at_home"
        ? Math.max(0, Number(sanitized.travel_fee ?? existingTotals?.travel_fee ?? 0))
        : 0;
      const participantTotal = (participantRows ?? []).reduce(
        (sum: number, p: any) => sum + Math.max(0, Number(p.price || 0)),
        0,
      );
      const productTotal = nextProducts.reduce(
        (sum: number, p: any) =>
          sum + Math.max(0, Number(p.total_price ?? p.totalPrice ?? (Number(p.unit_price ?? p.unitPrice ?? 0) * Number(p.quantity ?? 1)))),
        0,
      );
      sanitized.products = nextProducts;
      sanitized.travel_fee = nextTravelFee;
      sanitized.total_price = participantTotal + productTotal + nextTravelFee;
    }

    const { data, error } = await admin
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
    const admin = getSupabaseAdmin();
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: groupBooking, error: groupError } = await admin
      .from("group_bookings")
      .select("id, status")
      .eq("id", id)
      .eq("provider_id", providerId)
      .maybeSingle();

    if (groupError) {
      throw groupError;
    }
    if (!groupBooking) {
      return notFoundResponse("Group booking not found");
    }

    // Fetch booking IDs before cancelling so we can trigger waitlist.
    // Use the admin client for the write path: provider staff can manage
    // groups through this API, while legacy RLS only allowed provider owners.
    const { data: groupBookings, error: bookingFetchError } = await admin
      .from("bookings")
      .select("id")
      .eq("group_booking_id", id)
      .eq("provider_id", providerId)
      .not("status", "in", "(cancelled,no_show)");

    if (bookingFetchError) {
      throw bookingFetchError;
    }

    // Cancel all associated bookings first
    const now = new Date().toISOString();
    const { error: bookingsCancelError } = await admin
      .from("bookings")
      .update({
        status: "cancelled",
        cancelled_at: now,
        cancellation_reason: "Group booking cancelled by provider",
        updated_at: now,
      })
      .eq("group_booking_id", id)
      .eq("provider_id", providerId)
      .not("status", "in", "(cancelled,no_show)");

    if (bookingsCancelError) {
      throw bookingsCancelError;
    }

    // Then cancel the group booking
    const { error } = await admin
      .from("group_bookings")
      .update({ status: "cancelled", updated_at: now })
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
