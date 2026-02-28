import { SupabaseClient } from "@supabase/supabase-js";
import { handleApiError } from "@/lib/supabase/api-helpers";
import type { BookingDraft } from "@/types/beautonomi";
import type { ValidatedBookingData } from "./validate-booking";

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface CreatedBookingResult {
  booking: any;
  createdBookingServices: any[];
}

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * Create the booking row + booking_services in the database via the atomic
 * `create_booking_with_locking` RPC, then insert addons, products, group
 * booking records, resource assignments, and double-booking events.
 *
 * Returns either a `CreatedBookingResult` or a NextResponse error.
 */
export async function createBookingRecord(
  supabase: SupabaseClient,
  adminSupabase: SupabaseClient,
  draft: BookingDraft,
  validatedDraft: Record<string, any>,
  v: ValidatedBookingData,
  userId: string
): Promise<CreatedBookingResult | Response> {
  // ── Build the booking row ────────────────────────────────────────────────
  const bookingData: Record<string, any> = {
    booking_number: "", // Set by DB trigger
    customer_id: v.customerId,
    provider_id: draft.provider_id,
    status: v.appointmentStatus,
    location_type: draft.location_type,
    location_id: (draft as any).location_id || null,
    booking_source: "online",
    scheduled_at: draft.selected_datetime,
    package_id: (draft as any).package_id || null,
    subtotal: v.subtotal,
    travel_fee: v.travelFee,
    service_fee_config_id: v.serviceFeeConfigId,
    service_fee_percentage: v.serviceFeePercentage,
    service_fee_amount: v.serviceFeeAmount,
    service_fee_paid_by: "customer",
    tip_amount: v.tipAmount,
    tax_amount: v.taxAmount,
    discount_amount: v.packageDiscountAmount + v.promoDiscountAmount,
    discount_code: v.promoCode || null,
    promotion_discount_amount: v.promoDiscountAmount,
    membership_discount_amount: v.membershipDiscountAmount,
    total_amount: v.totalAmount,
    currency: v.currency,
    payment_status: "pending" as const,
    special_requests: draft.special_requests || null,
    loyalty_points_earned: v.loyaltyPointsEarned,
    promotion_id: v.promotionId,
    membership_plan_id: v.membershipPlanId,
  };

  // Flatten address for at-home bookings
  if (draft.location_type === "at_home" && draft.address) {
    bookingData.address_line1 = draft.address.line1;
    bookingData.address_line2 = draft.address.line2 || null;
    bookingData.address_city = draft.address.city;
    bookingData.address_state = draft.address.state || null;
    bookingData.address_country = draft.address.country;
    bookingData.address_postal_code = draft.address.postal_code || null;
    bookingData.address_latitude = draft.address.latitude ?? null;
    bookingData.address_longitude = draft.address.longitude ?? null;
  }

  // Group booking flag
  if (validatedDraft.is_group_booking) {
    bookingData.is_group_booking = true;
  }

  // ── Atomic insert via RPC ────────────────────────────────────────────────
  const { data: bookingId, error: bookingError } = await adminSupabase.rpc(
    "create_booking_with_locking",
    {
      p_booking_data: bookingData,
      p_booking_services: v.bookingServicesData,
      p_staff_id: draft.services[0].staff_id || null,
      p_start_at: v.selectedDatetime.toISOString(),
      p_end_at: v.bookingEnd.toISOString(),
    }
  );

  if (bookingError) {
    const msg = (bookingError as { message?: string }).message ?? "";
    if (msg.includes("BOOKING_SLOT_CONFLICT")) {
      return handleApiError(
        new Error("This time slot is no longer available. Please select another time."),
        "This time slot is no longer available. Please select another time.",
        "CONFLICT",
        409
      );
    }
    throw bookingError;
  }

  if (!bookingId) {
    return handleApiError(
      new Error("Failed to create booking"),
      "Failed to create booking",
      "CREATE_ERROR",
      500
    );
  }

  // ── Fetch the created booking ────────────────────────────────────────────
  const { data: booking, error: fetchError } = await adminSupabase
    .from("bookings")
    .select()
    .eq("id", bookingId)
    .single();

  if (fetchError || !booking) {
    return handleApiError(
      new Error("Failed to fetch created booking"),
      "Failed to fetch created booking",
      "FETCH_ERROR",
      500
    );
  }

  const loyaltyPointsUsed = Number((validatedDraft as any).loyalty_points_used ?? 0);
  if (loyaltyPointsUsed > 0) {
    await adminSupabase
      .from("bookings")
      .update({ loyalty_points_used: loyaltyPointsUsed })
      .eq("id", bookingId);
  }

  // Set guest_name from client_info so booking appears correctly in provider calendar
  const clientInfo = validatedDraft.client_info as { firstName?: string; lastName?: string } | undefined;
  if (clientInfo && (clientInfo.firstName || clientInfo.lastName)) {
    const guestName = [clientInfo.firstName, clientInfo.lastName].filter(Boolean).join(" ").trim();
    if (guestName) {
      await adminSupabase.from("bookings").update({ guest_name: guestName }).eq("id", bookingId);
      (booking as any).guest_name = guestName;
    }
  }

  // ── Group booking ────────────────────────────────────────────────────────
  if (v.isGroupBooking && v.groupParticipants && v.groupParticipants.length > 0) {
    const clientInfo = validatedDraft.client_info || {};

    try {
      const { createGroupBooking } = await import("@/lib/bookings/group-booking");
      const { createGroupBookingServices } = await import("@/lib/bookings/group-booking-services");

      // Build servicesMap for all participants (primary + group) so every participant's services get correct timing
      const allOfferingIds = new Set<string>(
        draft.services.map((s: any) => s.offering_id).concat(
          (v.groupParticipants || []).flatMap((p: any) => p.service_ids ?? p.serviceIds ?? [])
        )
      );
      const servicesMap = new Map();
      for (const offeringId of allOfferingIds) {
        const off = v.offeringById.get(offeringId);
        if (!off) continue;
        const primaryService = draft.services.find((s: any) => s.offering_id === offeringId);
        servicesMap.set(offeringId, {
          offering_id: off.id,
          staff_id: primaryService?.staff_id ?? null,
          duration_minutes: Number(off.duration_minutes),
          price: Number(off.price),
          currency: v.currency,
        });
      }

      await createGroupBookingServices(
        adminSupabase,
        booking.id,
        v.selectedDatetime,
        v.groupParticipants.map((p: any, i: number) => ({
          id: p.id || `p-${i}-${Date.now()}`,
          name: p.name,
          serviceIds: p.service_ids ?? p.serviceIds ?? [],
        })),
        servicesMap
      );

      const groupBooking = await createGroupBooking(
        adminSupabase,
        draft.provider_id,
        booking.id,
        [booking.id],
        [
          {
            booking_id: booking.id,
            participant_name: clientInfo.name || booking.guest_name || "Primary Contact",
            participant_email: clientInfo.email || null,
            participant_phone: clientInfo.phone || null,
            is_primary_contact: true,
          },
          ...v.groupParticipants.map((p: any) => ({
            booking_id: booking.id,
            participant_name: p.name,
            participant_email: p.email || null,
            participant_phone: p.phone || null,
            is_primary_contact: false,
          })),
        ]
      );

      (booking as any).group_booking_id = groupBooking.id;
      (booking as any).group_booking_ref = groupBooking.ref_number;

      await adminSupabase
        .from("bookings")
        .update({ group_booking_id: groupBooking.id })
        .eq("id", booking.id);

      // Send group notifications (best-effort)
      try {
        const { sendGroupBookingNotifications } = await import(
          "@/lib/bookings/group-booking-notifications"
        );
        await sendGroupBookingNotifications(supabase, booking.id, groupBooking.id);
      } catch (notifError) {
        console.error("Failed to send group booking notifications:", notifError);
      }
    } catch (err: any) {
      console.error("Failed to create group booking:", err);
      // If table doesn't exist, that's okay – feature not fully deployed yet
      if (!err.message?.includes("does not exist") && !err.code?.includes("42P01")) {
        // Log only non-missing-table errors
      }
    }
  }

  // ── Fetch created booking_services ───────────────────────────────────────
  const { error: bookingServicesError, data: createdBookingServices } = await adminSupabase
    .from("booking_services")
    .select()
    .eq("booking_id", booking.id);

  if (bookingServicesError) throw bookingServicesError;

  // ── Resource assignments ─────────────────────────────────────────────────
  const draftResourceIds = (draft as any).resource_ids as string[] | undefined;
  if (v.allResourceIds.length > 0 && createdBookingServices) {
    const { assignResourcesToBooking, getRequiredResourcesForOffering } = await import(
      "@/lib/resources/assignment"
    );
    const resourceAssignments: any[] = [];
    let resourceCursor = 0;

    for (const service of createdBookingServices) {
      const requiredResources = await getRequiredResourcesForOffering(
        supabase,
        service.offering_id
      );
      const count = requiredResources.length;
      if (count === 0) continue;

      if (Array.isArray(draftResourceIds) && resourceCursor < draftResourceIds.length) {
        for (let i = 0; i < count && resourceCursor < draftResourceIds.length; i++) {
          resourceAssignments.push({
            booking_id: booking.id,
            booking_service_id: service.id,
            resource_id: draftResourceIds[resourceCursor++],
            scheduled_start_at: service.scheduled_start_at,
            scheduled_end_at: service.scheduled_end_at,
          });
        }
      } else {
        for (const resourceId of requiredResources) {
          resourceAssignments.push({
            booking_id: booking.id,
            booking_service_id: service.id,
            resource_id: resourceId,
            scheduled_start_at: service.scheduled_start_at,
            scheduled_end_at: service.scheduled_end_at,
          });
        }
      }
    }

    if (resourceAssignments.length > 0) {
      await assignResourcesToBooking(adminSupabase, resourceAssignments);
    }
  }

  // ── Double-booking override event ────────────────────────────────────────
  if (v.allowOverride && v.conflictResult?.hasConflict) {
    await adminSupabase.from("booking_events").insert({
      booking_id: booking.id,
      event_type: "double_booking_override",
      event_data: {
        reason: "Manual override allowed by provider settings",
        warning_acknowledged: true,
        conflicting_bookings:
          v.conflictResult.conflictingBookings?.map((cb: any) => cb.booking_id) || [],
      },
      created_by: userId,
    });
  }

  // ── Addons ───────────────────────────────────────────────────────────────
  const addonIds = (draft.addons || []) as string[];
  if (addonIds.length > 0) {
    const bookingAddonsRows = addonIds.map((id) => ({
      booking_id: booking.id,
      addon_id: id,
      quantity: 1,
      price: Number(v.addonById.get(id)?.price || 0),
      currency: v.currency,
    }));
    const { error: bookingAddonsError } = await adminSupabase
      .from("booking_addons")
      .insert(bookingAddonsRows);
    if (bookingAddonsError) throw bookingAddonsError;
  }

  // ── Products ─────────────────────────────────────────────────────────────
  const products = (draft as any).products || [];
  if (products.length > 0) {
    const primaryStaffId = draft.services?.[0]?.staff_id ?? null;
    const bookingProductsRows = products.map((product: any) => ({
      booking_id: booking.id,
      product_id: product.productId,
      quantity: product.quantity,
      unit_price: product.unitPrice,
      total_price: product.totalPrice,
      currency: v.currency,
      staff_id: primaryStaffId,
    }));

    const { error: bookingProductsError } = await adminSupabase
      .from("booking_products")
      .insert(bookingProductsRows);
    if (bookingProductsError) throw bookingProductsError;

    // Update product stock
    for (const product of products) {
      const productData = v.productById.get((product as any).productId ?? product.product_id);
      if (productData?.track_stock_quantity) {
        const newQuantity = (productData.quantity || 0) - product.quantity;
        await adminSupabase
          .from("products")
          .update({ quantity: Math.max(0, newQuantity) })
          .eq("id", product.productId);
      }
    }
  }

  return {
    booking,
    createdBookingServices: createdBookingServices || [],
  };
}
