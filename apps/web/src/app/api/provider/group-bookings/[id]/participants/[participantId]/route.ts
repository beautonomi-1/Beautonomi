import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import {
  groupPackageTotal,
  groupProductLineTotal,
  validateAndPriceGroupPackage,
} from "@/lib/bookings/group-booking-package-pricing";

async function recalculateGroupBookingTotal(admin: ReturnType<typeof getSupabaseAdmin>, groupId: string) {
  const [{ data: group }, { data: participantRows }] = await Promise.all([
    admin
      .from("group_bookings")
      .select("products, travel_fee, location_type, package_id, provider_id, location_id, service_id")
      .eq("id", groupId)
      .maybeSingle(),
    admin
      .from("booking_participants")
      .select("price, service_id")
      .eq("group_booking_id", groupId),
  ]);
  const products = Array.isArray(group?.products) ? group.products : [];
  const participantTotal = (participantRows ?? []).reduce((sum: number, p: any) => sum + Math.max(0, Number(p.price || 0)), 0);
  const productTotal = products.reduce(
    (sum: number, p: any) => sum + groupProductLineTotal(p),
    0,
  );
  const travelFee = group?.location_type === "at_home" ? Math.max(0, Number(group.travel_fee || 0)) : 0;
  let packageDiscount = 0;
  if (group?.package_id && group?.provider_id) {
    const pkgPricing = await validateAndPriceGroupPackage({
      supabaseAdmin: admin,
      providerId: group.provider_id as string,
      packageId: group.package_id as string,
      locationType: String(group.location_type || "at_salon"),
      locationId: group.location_id as string | null | undefined,
      participantRows: (participantRows ?? []) as Array<Record<string, unknown>>,
      fallbackServiceId: group.service_id as string | null | undefined,
      productRows: products,
      participantTotal,
    });
    if (pkgPricing.ok) packageDiscount = pkgPricing.packageDiscount;
  }
  await admin
    .from("group_bookings")
    .update({
      total_price: groupPackageTotal({ participantTotal, productTotal, travelFee, packageDiscount }),
      updated_at: new Date().toISOString(),
    })
    .eq("id", groupId);
}

/**
 * DELETE /api/provider/group-bookings/[id]/participants/[participantId]
 * Removes a participant row (booking_participants.id) and clears booking.group_booking_id when set.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; participantId: string }> }
) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request
    );
    const supabase = await getSupabaseServer(request);
    const admin = getSupabaseAdmin();
    const { id: groupId, participantId } = await params;

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: gb, error: groupError } = await admin
      .from("group_bookings")
      .select("id")
      .eq("id", groupId)
      .eq("provider_id", providerId)
      .maybeSingle();

    if (groupError) {
      throw groupError;
    }
    if (!gb) {
      return notFoundResponse("Group booking not found");
    }

    const { data: part, error: pErr } = await admin
      .from("booking_participants")
      .select("id, booking_id, group_booking_id")
      .eq("id", participantId)
      .eq("group_booking_id", groupId)
      .maybeSingle();

    if (pErr || !part) {
      return notFoundResponse("Participant not found");
    }

    const { error: dErr } = await admin
      .from("booking_participants")
      .delete()
      .eq("id", participantId)
      .eq("group_booking_id", groupId);

    if (dErr) {
      throw dErr;
    }

    // §Final-audit 2026-04 (P2 residual): previously this endpoint only
    // set `bookings.group_booking_id = null`, leaving the child booking
    // row and its `booking_services` ACTIVE on the calendar. That turned
    // every removed participant into a "phantom block" — staff was still
    // marked busy for a person who had dropped out, and
    // `load-constraints.ts` refused to offer that slot again.
    //
    // Correct behavior: cancel the child booking too, which cascades
    // through the regular cancellation triggers (status → cancelled,
    // `cancelled_at` stamp, availability freed by load-constraints which
    // filters `status !== 'cancelled'`). We do NOT delete the booking —
    // audit trail must be preserved.
    if (part.booking_id) {
      const { error: bookingError } = await admin
        .from("bookings")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          cancellation_reason: "Removed from group booking",
          group_booking_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", part.booking_id)
        .eq("provider_id", providerId)
        // Do not clobber an already-completed booking.
        .not("status", "in", "(completed,no_show,cancelled)");
      if (bookingError) {
        throw bookingError;
      }
    }

    await recalculateGroupBookingTotal(admin, groupId);

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to remove group participant");
  }
}
