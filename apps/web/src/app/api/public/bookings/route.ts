import { NextRequest } from "next/server";
import { z } from "zod";
import { normalizePublicStaffIdForDatabase } from "@beautonomi/utils";
import { getCancellationPolicy, canCancelBooking } from "@/lib/bookings/cancellation-policy";
import { withRouteMetrics } from "@/lib/monitoring/route-metrics";
import {
  bookingDraftSchema,
  toBookingDraftFromPublicBody,
  type PublicBookingValidatedBody,
} from "@/lib/public-booking/booking-draft-schema";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSupabaseServer } from "@/lib/supabase/server";
import { handleApiError, successResponse, errorResponse } from "@/lib/supabase/api-helpers";
import { evaluateMarketAvailabilityFromRequest } from "@/lib/tenant/market-availability";
import { requirePublicTenant } from "@/lib/tenant/require-public-tenant";

import { createBookingRecord } from "./_helpers/create-booking-record";
import { ensureUserProfileForAuthUser } from "./_helpers/ensure-user-profile";
import { postBookingEffects } from "./_helpers/post-booking";
import { processPayment } from "./_helpers/process-payment";
import { releaseBookingSlotAfterPaymentFailure } from "./_helpers/release-booking-slot-after-payment-failure";
import { validateBooking } from "./_helpers/validate-booking";
import { checkBookingCreationRateLimit, incrementBookingCreation } from "@/lib/rate-limit/booking-creation";
import { subscribeRecurringEligible } from "@/lib/recurring/subscribe-recurring-eligibility";
import { NextResponse } from "next/server";

/**
 * POST /api/public/bookings
 *
 * Create a new booking (public endpoint, but may require auth for some features)
 */
export async function POST(request: NextRequest) {
  const rateLimit = await checkBookingCreationRateLimit(request);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many booking requests. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds ?? 3600) },
      }
    );
  }
  incrementBookingCreation(request);

  return withRouteMetrics(
    request,
    "/api/public/bookings",
    "POST",
    async () => {
      try {
        const supabase = await getSupabaseServer();
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return errorResponse("Invalid request body.", "VALIDATION_ERROR", 400);
        }

        // 1. Parse & validate input (normalize synthetic staff ids for DB FKs)
        let validatedDraft: PublicBookingValidatedBody;
        try {
          const parsed = bookingDraftSchema.parse(body);
          validatedDraft = {
            ...parsed,
            services: parsed.services.map((s) => {
              const { dbStaffId } = normalizePublicStaffIdForDatabase(s.staff_id ?? undefined);
              return { ...s, staff_id: dbStaffId };
            }),
          };
        } catch (validationError: unknown) {
          throw validationError;
        }
        const draft = toBookingDraftFromPublicBody(validatedDraft);

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

        const tenantRes = await requirePublicTenant(request);
        if (tenantRes instanceof Response) {
          return tenantRes;
        }
        const { tenantId: marketTenantId } = tenantRes;

        const marketAvailability = evaluateMarketAvailabilityFromRequest(request);
        if (marketAvailability.status === "restricted") {
          return handleApiError(
            new Error("Access unavailable for this country"),
            "Access unavailable in your country due to legal or regulatory restrictions.",
            "COUNTRY_RESTRICTED",
            451,
          );
        }

        const { data: marketTenant } = await supabaseAdmin
          .from("tenants")
          .select("slug")
          .eq("id", marketTenantId)
          .maybeSingle();

        if ((marketTenant as { slug?: string } | null)?.slug === "global") {
          return handleApiError(
            new Error("Bookings are unavailable on global entry"),
            "Please switch to an available market to continue booking.",
            "MARKET_SWITCH_REQUIRED",
            403,
          );
        }

        // 2.5. Ensure user has a public profile (handles new sign-ins where trigger hasn't run yet)
        await ensureUserProfileForAuthUser(supabaseAdmin, user, marketTenantId);

        // 2.6. If rescheduling (new booking replacing an existing one), cancel the old booking first
        const rescheduleBookingId = validatedDraft.reschedule_booking_id ?? undefined;
        if (rescheduleBookingId) {
          const { data: oldBooking, error: oldBookingError } = await supabaseAdmin
            .from("bookings")
            .select("id, provider_id, location_type, scheduled_at, created_at, status, customer_id, tenant_id")
            .eq("id", rescheduleBookingId)
            .eq("tenant_id", marketTenantId)
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

        // 2.7. Cancel any stale pending/pending_payment bookings by this user for the
        //      same provider and overlapping time window before conflict check runs.
        //      This prevents "slot taken" false positives when the customer retries
        //      after a failed/abandoned payment attempt.
        {
          const selectedDt = new Date(draft.selected_datetime);
          const windowStart = new Date(selectedDt.getTime() - 4 * 60 * 60 * 1000); // -4 h
          const windowEnd   = new Date(selectedDt.getTime() + 4 * 60 * 60 * 1000); // +4 h
          await supabaseAdmin
            .from("bookings")
            .update({
              status: "cancelled",
              cancelled_at: new Date().toISOString(),
              cancelled_by: user.id,
              cancellation_reason: "Payment not completed — auto-cancelled on retry",
              updated_at: new Date().toISOString(),
            })
            .eq("customer_id", user.id)
            .eq("provider_id", draft.provider_id)
            .in("status", ["pending", "pending_payment"])
            .gte("scheduled_at", windowStart.toISOString())
            .lte("scheduled_at", windowEnd.toISOString());
        }

        // 3. Validate booking (provider, services, pricing, conflicts, resources)
        const validationResult = await validateBooking(
          supabase,
          supabaseAdmin,
          draft,
          validatedDraft,
          user.id,
          marketTenantId
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
          validatedDraft,
          v,
          user.id
        );

        if (createResult instanceof Response) {
          return createResult;
        }

        const { booking } = createResult;

        // 5. Process payment (gift card, wallet, Paystack card, cash)
        // If payment setup fails after the row exists, release the slot (cancel) so retry is not a false 409.
        let bookingIdPendingRelease = booking.id;
        try {
          const paymentResult = await processPayment({
            supabase,
            supabaseAdmin,
            draft,
            validatedDraft,
            v,
            booking,
            request,
          });

          if (paymentResult instanceof Response) {
            await releaseBookingSlotAfterPaymentFailure(supabaseAdmin, booking.id, user.id);
            bookingIdPendingRelease = "";
            return paymentResult;
          }

          const { paymentUrl } = paymentResult;
          bookingIdPendingRelease = "";

          // 6. Post-booking side effects (cache, waitlist, analytics) — fire & forget
          const savedPaymentMethodId = validatedDraft.payment_method_id ?? null;
          await postBookingEffects({
            supabase,
            draft,
            validatedDraft,
            v,
            booking,
            paymentUrl,
            savedPaymentMethodId,
          });

          let recurring_subscription:
            | { created: true }
            | { created: false; pending?: true; message?: string }
            | undefined;
          if (validatedDraft.subscribe_recurring?.enabled) {
            if (
              !subscribeRecurringEligible({
                subscribe_recurring: validatedDraft.subscribe_recurring,
                reschedule_booking_id: validatedDraft.reschedule_booking_id,
                is_group_booking: validatedDraft.is_group_booking,
                has_group_participants: Boolean(
                  validatedDraft.group_participants && validatedDraft.group_participants.length > 0,
                ),
              })
            ) {
              recurring_subscription = {
                created: false,
                message: validatedDraft.reschedule_booking_id
                  ? "Not available when rescheduling."
                  : "Not available for group bookings.",
              };
            } else if (paymentUrl) {
              recurring_subscription = { created: false, pending: true };
            } else {
              recurring_subscription = { created: true };
            }
          }

          // 7. Return response
          return successResponse({
            booking_id: booking.id,
            booking_number: booking.booking_number,
            payment_url: paymentUrl,
            ...(recurring_subscription ? { recurring_subscription } : {}),
          });
        } catch (paymentOrPostError) {
          if (bookingIdPendingRelease) {
            await releaseBookingSlotAfterPaymentFailure(supabaseAdmin, bookingIdPendingRelease, user.id);
          }
          throw paymentOrPostError;
        }
      } catch (error) {
        if (error instanceof z.ZodError) {
          return handleApiError(
            new Error(error.issues.map((issue) => issue.message).join(", ")),
            "Validation failed",
            "VALIDATION_ERROR",
            400
          );
        }
        return handleApiError(error, "Failed to create booking");
      }
    },
  );
}
