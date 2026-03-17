import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { z } from "zod";
import type { BookingDraft } from "@/types/beautonomi";

import { validateBooking } from "./_helpers/validate-booking";
import { createBookingRecord } from "./_helpers/create-booking-record";
import { processPayment } from "./_helpers/process-payment";
import { postBookingEffects } from "./_helpers/post-booking";
import { ensureUserProfileForAuthUser } from "./_helpers/ensure-user-profile";
import { getCancellationPolicy, canCancelBooking } from "@/lib/bookings/cancellation-policy";

const bookingDraftSchema = z.object({
  provider_id: z.string().uuid("Invalid provider ID"),
  services: z
    .array(
      z.object({
        offering_id: z.string().uuid("Invalid offering ID"),
        staff_id: z.string().uuid("Invalid staff ID").optional().nullable(),
      })
    )
    .min(1, "At least one service is required"),
  selected_datetime: z.string().datetime("Invalid datetime format"),
  location_type: z.enum(["at_home", "at_salon"]),
  location_id: z.string().uuid().optional().nullable(),
  address: z
    .object({
      line1: z.string().min(1),
      line2: z.string().optional(),
      city: z.string().min(1),
      state: z.string().optional(),
      country: z.string().min(1),
      postal_code: z.string().optional(),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
      apartment_unit: z.string().optional().nullable(),
      building_name: z.string().optional().nullable(),
      floor_number: z.string().optional().nullable(),
      access_codes: z.record(z.string(), z.string()).optional().nullable(),
      parking_instructions: z.string().optional().nullable(),
      location_landmarks: z.string().optional().nullable(),
    })
    .optional()
    .nullable(),
  addons: z.array(z.string().uuid("Invalid addon ID")).optional(),
  products: z.array(
    z.object({
      productId: z.string().uuid("Invalid product ID"),
      quantity: z.number().int().positive("Quantity must be positive"),
      unitPrice: z.number().min(0, "Unit price must be non-negative"),
      totalPrice: z.number().min(0, "Total price must be non-negative"),
    })
  ).optional(),
  package_id: z.string().uuid().optional().nullable(),
  tip_amount: z.number().min(0).optional(),
  travel_fee: z.number().min(0).optional(),
  special_requests: z.string().optional().nullable(),
  house_call_instructions: z.string().optional().nullable(),
  client_info: z.any().optional(),
  payment_method: z.enum(["card", "cash", "giftcard"]).optional(),
  payment_method_id: z.string().uuid().optional().nullable(),
  payment_option: z.enum(["deposit", "full"]).optional(),
  save_card: z.boolean().optional(),
  set_as_default: z.boolean().optional(),
  promotion_code: z.string().optional().nullable(),
  gift_card_code: z.string().optional().nullable(),
  membership_plan_id: z.string().uuid().optional().nullable(),
  use_wallet: z.boolean().optional(),
  is_group_booking: z.boolean().optional(),
  group_participants: z.array(
    z.object({
      name: z.string(),
      email: z.string().optional().nullable(),
      phone: z.string().optional().nullable(),
      service_ids: z.array(z.string().uuid()),
      notes: z.string().optional().nullable(),
    })
  ).optional().nullable(),
  hold_id: z.string().uuid().optional().nullable(),
  loyalty_points_used: z.number().int().min(0).optional(),
  reschedule_booking_id: z.string().uuid().optional().nullable(),
});

/**
 * POST /api/public/bookings
 *
 * Create a new booking (public endpoint, but may require auth for some features)
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await getSupabaseServer();
    const body = await request.json();

    // 1. Parse & validate input
    let validatedDraft;
    try {
      validatedDraft = bookingDraftSchema.parse(body);
    } catch (validationError: any) {
      throw validationError;
    }
    const draft: BookingDraft = validatedDraft as BookingDraft;

    // 2. Authenticate user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return handleApiError(
        new Error("Authentication required"),
        "Authentication required",
        "AUTH_REQUIRED",
        401
      );
    }

    const supabaseAdmin = await getSupabaseAdmin();

    // 2.5. Ensure user has a public profile (handles new sign-ins where trigger hasn't run yet)
    await ensureUserProfileForAuthUser(supabaseAdmin, user);

    // 2.6. If rescheduling (new booking replacing an existing one), cancel the old booking first
    const rescheduleBookingId = (validatedDraft as Record<string, unknown>).reschedule_booking_id as string | undefined;
    if (rescheduleBookingId) {
      const { data: oldBooking, error: oldBookingError } = await supabaseAdmin
        .from("bookings")
        .select("id, provider_id, location_type, scheduled_at, created_at, status, customer_id")
        .eq("id", rescheduleBookingId)
        .single();

      if (oldBookingError || !oldBooking) {
        return handleApiError(
          new Error("Original booking not found"),
          "The booking you are rescheduling could not be found.",
          "NOT_FOUND",
          404
        );
      }

      if (oldBooking.customer_id !== user.id) {
        return handleApiError(
          new Error("Unauthorized"),
          "You can only reschedule your own bookings.",
          "UNAUTHORIZED",
          403
        );
      }

      if (oldBooking.status === "cancelled") {
        return handleApiError(
          new Error("Booking already cancelled"),
          "This booking has already been cancelled.",
          "ALREADY_CANCELLED",
          400
        );
      }

      const policy = await getCancellationPolicy(
        supabase,
        oldBooking.provider_id,
        (oldBooking.location_type as "at_salon" | "at_home") || "at_salon"
      );

      if (policy) {
        const checkResult = canCancelBooking(
          {
            id: oldBooking.id,
            created_at: oldBooking.created_at,
            scheduled_at: oldBooking.scheduled_at,
            location_type: (oldBooking.location_type as "at_salon" | "at_home") || "at_salon",
          },
          policy
        );

        if (!checkResult.allowed) {
          return handleApiError(
            new Error(checkResult.reason ?? "Rescheduling not allowed"),
            checkResult.reason ?? "Rescheduling not allowed. Please contact the provider.",
            "RESCHEDULE_BLOCKED",
            403
          );
        }
      }

      const { error: cancelError } = await supabaseAdmin
        .from("bookings")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          cancelled_by: user.id,
          cancellation_reason: "Rescheduled to new time",
          updated_at: new Date().toISOString(),
        })
        .eq("id", rescheduleBookingId);

      if (cancelError) {
        return handleApiError(
          new Error("Failed to cancel original booking"),
          "Could not complete reschedule. Please try again.",
          "CANCEL_FAILED",
          500
        );
      }
    }

    // 3. Validate booking (provider, services, pricing, conflicts, resources)
    const validationResult = await validateBooking(
      supabase,
      supabaseAdmin,
      draft,
      validatedDraft as Record<string, any>,
      user.id
    );

    // If validation returned an error Response, forward it
    if (validationResult instanceof Response) {
      return validationResult;
    }

    const v = validationResult;

    // 4. Create booking record (DB insert + addons/products/group)
    const createResult = await createBookingRecord(
      supabase,
      supabaseAdmin,
      draft,
      validatedDraft as Record<string, any>,
      v,
      user.id
    );

    if (createResult instanceof Response) {
      return createResult;
    }

    const { booking } = createResult;

    // 5. Process payment (gift card, wallet, Paystack card, cash)
    const paymentResult = await processPayment({
      supabase,
      supabaseAdmin,
      draft,
      validatedDraft: validatedDraft as Record<string, any>,
      v,
      booking,
    });

    if (paymentResult instanceof Response) {
      return paymentResult;
    }

    const { paymentUrl } = paymentResult;

    // 6. Post-booking side effects (cache, waitlist, analytics) — fire & forget
    const savedPaymentMethodId = (draft as any).payment_method_id || null;
    await postBookingEffects({
      supabase,
      draft,
      validatedDraft: validatedDraft as Record<string, any>,
      v,
      booking,
      paymentUrl,
      savedPaymentMethodId,
    });

    // 7. Return response
    return successResponse({
      booking_id: booking.id,
      booking_number: booking.booking_number,
      payment_url: paymentUrl,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(
        new Error(error.issues.map((e: any) => e.message).join(", ")),
        "Validation failed",
        "VALIDATION_ERROR",
        400
      );
    }
    return handleApiError(error, "Failed to create booking");
  }
}
