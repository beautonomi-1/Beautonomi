import { NextRequest } from "next/server";
import { addMinutes } from "date-fns";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { evaluateProviderSlotAgainstGrid } from "@/lib/provider-booking/compute-provider-slot-grid";
import { checkActiveHoldOverlap } from "@/lib/bookings/conflict-check";
import { rescheduleBookingServicesSequential } from "@/lib/bookings/reschedule-booking-services";
import {
  groupPackageTotal,
  groupProductLineTotal,
  validateAndPriceGroupPackage,
} from "@/lib/bookings/group-booking-package-pricing";
import { computeWalletGiftCoverageOutstanding } from "@/lib/bookings/provider-booking-finance";

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
          total_paid, total_refunded, wallet_amount, gift_card_amount, payment_status,
          customer:users!bookings_customer_id_fkey(id, full_name, email, phone, avatar_url)
        ),
        service_packages:package_id(id, name),
        booking_participants(
          id, booking_id, participant_name, participant_email, participant_phone,
          is_primary_contact, service_id, service_name, price, duration_minutes, addons,
          checked_in_at, checked_out_at
        )
      `)
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (error || !groupBooking) {
      return notFoundResponse("Group booking not found");
    }

    const pkg = Array.isArray((groupBooking as any).service_packages)
      ? (groupBooking as any).service_packages[0]
      : (groupBooking as any).service_packages;
    const bookingPaymentById = new Map(
      (((groupBooking as any).bookings ?? []) as any[]).map((booking: any) => {
        const paidAfterRefunds = Math.max(
          0,
          Number(booking.total_paid ?? 0) - Number(booking.total_refunded ?? 0),
        );
        const walletGiftCoverage =
          Number(booking.wallet_amount ?? 0) + Number(booking.gift_card_amount ?? 0);
        const coverage = Math.max(paidAfterRefunds, walletGiftCoverage);
        const balanceDue = Math.max(0, Number(booking.total_amount ?? 0) - coverage);
        return [
          booking.id,
          {
            payment_status:
              booking.payment_status || (balanceDue <= 0 && Number(booking.total_amount ?? 0) > 0 ? "paid" : coverage > 0 ? "partially_paid" : "pending"),
            paid: Number(booking.total_amount ?? 0) > 0 && balanceDue <= 0,
            balance_due: balanceDue,
            total_paid: Number(booking.total_paid ?? 0),
            total_refunded: Number(booking.total_refunded ?? 0),
            wallet_gift_coverage: walletGiftCoverage,
          },
        ];
      }),
    );
    const participants = (((groupBooking as any).booking_participants ?? []) as any[]).map((participant) => ({
      ...participant,
      ...(participant.booking_id ? bookingPaymentById.get(participant.booking_id) ?? {} : {}),
    }));

    return successResponse({
      ...groupBooking,
      booking_participants: participants,
      package_name: pkg?.name ?? null,
    });
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
      "total_price" in sanitized ||
      "package_id" in sanitized ||
      "service_id" in sanitized
    ) {
      const [{ data: existingTotals }, { data: participantRows }] = await Promise.all([
        admin
          .from("group_bookings")
          .select("products, travel_fee, location_type, package_id, location_id, service_id")
          .eq("id", id)
          .eq("provider_id", providerId)
          .maybeSingle(),
        admin
          .from("booking_participants")
          .select("price, service_id")
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
        (sum: number, p: any) => sum + groupProductLineTotal(p),
        0,
      );
      const nextPackageId =
        "package_id" in sanitized
          ? ((sanitized.package_id as string | null | undefined) ?? null)
          : ((existingTotals?.package_id as string | null | undefined) ?? null);
      const nextServiceId =
        (sanitized.service_id as string | null | undefined) ??
        (existingTotals?.service_id as string | null | undefined) ??
        null;
      const pkgPricing = await validateAndPriceGroupPackage({
        supabaseAdmin: admin,
        providerId,
        packageId: nextPackageId,
        locationType: nextLocationType,
        locationId: nextLocationType === "at_home" ? null : ((sanitized.location_id as string | null | undefined) ?? existingTotals?.location_id ?? null),
        participantRows: (participantRows ?? []) as Array<Record<string, unknown>>,
        fallbackServiceId: nextServiceId,
        productRows: nextProducts,
        participantTotal,
      });
      if (pkgPricing.ok === false) {
        return errorResponse(pkgPricing.message, pkgPricing.code, 400);
      }
      sanitized.products = nextProducts;
      sanitized.travel_fee = nextTravelFee;
      sanitized.total_price = groupPackageTotal({
        participantTotal,
        productTotal,
        travelFee: nextTravelFee,
        packageDiscount: pkgPricing.packageDiscount,
      });
    }

    const shouldSyncChildBookings =
      "scheduled_at" in sanitized ||
      "staff_id" in sanitized ||
      "location_id" in sanitized ||
      "location_type" in sanitized ||
      "address_line1" in sanitized ||
      "address_city" in sanitized ||
      "address_state" in sanitized ||
      "address_country" in sanitized ||
      "address_postal_code" in sanitized ||
      "address_latitude" in sanitized ||
      "address_longitude" in sanitized ||
      "travel_fee" in sanitized;

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

    if (shouldSyncChildBookings) {
      const childUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if ("scheduled_at" in sanitized) childUpdate.scheduled_at = sanitized.scheduled_at;
      if ("location_id" in sanitized) childUpdate.location_id = sanitized.location_id;
      if ("location_type" in sanitized) childUpdate.location_type = sanitized.location_type;
      for (const key of [
        "address_line1",
        "address_city",
        "address_state",
        "address_country",
        "address_postal_code",
        "address_latitude",
        "address_longitude",
        "travel_fee",
      ]) {
        if (key in sanitized) childUpdate[key] = sanitized[key];
      }
      const { data: childRows, error: childFetchError } = await admin
        .from("bookings")
        .select("id")
        .eq("group_booking_id", id)
        .eq("provider_id", providerId)
        .not("status", "in", "(completed,no_show,cancelled)");
      if (childFetchError) throw childFetchError;
      if (childRows && childRows.length > 0) {
        const childIds = childRows.map((row: { id: string }) => row.id);
        const { error: childUpdateError } = await admin
          .from("bookings")
          .update(childUpdate)
          .in("id", childIds)
          .eq("provider_id", providerId);
        if (childUpdateError) throw childUpdateError;
        if ("scheduled_at" in sanitized && typeof sanitized.scheduled_at === "string") {
          await Promise.all(
            childIds.map((bookingId: string) =>
              rescheduleBookingServicesSequential(admin, bookingId, sanitized.scheduled_at as string, {
                ...(typeof sanitized.staff_id === "string" ? { staffId: sanitized.staff_id } : {}),
              }),
            ),
          );
        }
      }
    }

    return successResponse(data);
  } catch (error) {
    return handleApiError(error, "Failed to update group booking");
  }
}

/**
 * POST /api/provider/group-bookings/[id]?action=...
 *
 * Handles synthetic group:<id> actions redirected from the merged bookings
 * endpoints. This keeps provider app/web group rows actionable instead of
 * redirecting POST requests to a route with no POST handler.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
    const { id } = await params;
    const action = new URL(request.url).searchParams.get("action") ?? "";
    const body = await request.json().catch(() => ({}));
    const supabase = await getSupabaseServer(request);
    const admin = getSupabaseAdmin();
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: groupBooking, error: groupError } = await admin
      .from("group_bookings")
      .select("id, status, total_price")
      .eq("id", id)
      .eq("provider_id", providerId)
      .maybeSingle();

    if (groupError) throw groupError;
    if (!groupBooking) return notFoundResponse("Group booking not found");

    const now = new Date().toISOString();

    if (action === "start_service") {
      const { error: bookingsError } = await admin
        .from("bookings")
        .update({
          status: "in_progress",
          current_stage: "service_started",
          updated_at: now,
        })
        .eq("group_booking_id", id)
        .eq("provider_id", providerId)
        .in("status", ["confirmed", "waiting", "checked_in"]);
      if (bookingsError) throw bookingsError;
      const { data } = await admin
        .from("group_bookings")
        .update({ updated_at: now })
        .eq("id", id)
        .eq("provider_id", providerId)
        .select()
        .single();
      return successResponse({ group_booking: data, message: "Group service started" });
    }

    if (action === "complete_service") {
      const { error: bookingsError } = await admin
        .from("bookings")
        .update({
          status: "completed",
          current_stage: "service_completed",
          completed_at: now,
          updated_at: now,
        })
        .eq("group_booking_id", id)
        .eq("provider_id", providerId)
        .in("status", ["in_progress"]);
      if (bookingsError) throw bookingsError;
      const { data, error } = await admin
        .from("group_bookings")
        .update({ status: "completed", updated_at: now })
        .eq("id", id)
        .eq("provider_id", providerId)
        .select()
        .single();
      if (error) throw error;
      return successResponse({ group_booking: data, message: "Group service completed" });
    }

    if (action === "mark_paid") {
      const paymentMethod = body.payment_method === "mobile" ? "other" : body.payment_method;
      if (!["cash", "card", "bank_transfer", "other"].includes(paymentMethod)) {
        return errorResponse("Valid payment_method is required (cash, card, bank_transfer, other)", "VALIDATION_ERROR", 400);
      }

      const { data: bookings, error: bookingsError } = await admin
        .from("bookings")
        .select("id, tenant_id, total_amount, total_paid, total_refunded, wallet_amount, gift_card_amount, status")
        .eq("group_booking_id", id)
        .eq("provider_id", providerId)
        .not("status", "in", "(cancelled,no_show)");
      if (bookingsError) throw bookingsError;

      const paymentProvider = paymentMethod === "cash" ? "cash" : "other";
      const rows = (bookings ?? [])
        .map((booking: any) => {
          const remaining = computeWalletGiftCoverageOutstanding({
            totalAmount: Number(booking.total_amount ?? 0),
            totalPaid: Number(booking.total_paid ?? 0),
            totalRefunded: Number(booking.total_refunded ?? 0),
            walletAmount: Number(booking.wallet_amount ?? 0),
            giftCardAmount: Number(booking.gift_card_amount ?? 0),
          });
          if (remaining <= 0) return null;
          return {
            booking_id: booking.id,
            tenant_id: booking.tenant_id ?? null,
            amount: remaining,
            payment_method: paymentMethod,
            payment_provider: paymentProvider,
            status: "completed",
            notes: body.notes || `Group payment received via ${paymentMethod}`,
            created_by: user.id,
          };
        })
        .filter(Boolean);

      if (rows.length === 0) {
        return errorResponse("Group booking is already fully paid", "ALREADY_PAID", 400);
      }

      const { data: payments, error: paymentsError } = await admin
        .from("booking_payments")
        .insert(rows)
        .select();
      if (paymentsError) throw paymentsError;
      return successResponse({ payments, message: "Group booking payments recorded" });
    }

    if (action === "refund") {
      return errorResponse(
        "Group booking refunds must be issued from the individual participant bookings so wallet credits and audit trails stay accurate.",
        "GROUP_REFUND_UNSUPPORTED",
        400,
      );
    }

    return errorResponse("Unsupported group booking action", "UNSUPPORTED_ACTION", 400);
  } catch (error) {
    return handleApiError(error, "Failed to apply group booking action");
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
