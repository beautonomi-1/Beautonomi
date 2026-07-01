import { NextRequest } from "next/server";
import { z } from "zod";
import { normalizePublicStaffIdForDatabase, getMissingRequiredProviderFormField } from "@beautonomi/utils";
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
import { invalidateProviderBookingsReadCache } from "@/lib/bookings/provider-bookings-read-cache";
import { NextResponse } from "next/server";
import {
  extractIdempotencyKey,
  lookupIdempotentResponse,
  rememberIdempotentResponse,
} from "@/lib/http/idempotency";
import { verifyPublicBookingCaptcha } from "@/lib/security/captcha";

const PUBLIC_BOOKINGS_ENDPOINT = "POST /api/public/bookings";

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
      // §Customer-launch (audit 2026-04 — follow-up): Vercel 500s on this
      // endpoint were landing in Sentry with only "Failed to create booking"
      // as context. That makes every case look identical. We now track a
      // `stage` tag so the thrown error carries the step that blew up
      // (validate / create / forms / payment / post-effects) without
      // changing the client-facing shape.
      let stage: "preflight" | "idempotency" | "captcha" | "validate_input" | "auth"
        | "tenant_resolve" | "market_check" | "ensure_profile" | "reschedule_cancel"
        | "stale_pending_cancel" | "validate_forms" | "validate_booking" | "create_booking" | "persist_forms"
        | "consume_hold" | "process_payment" | "post_effects" | "idempotency_cache" = "preflight";
      try {
        // §Customer-launch (audit 2026-04): previously called without the
        // `request` arg, which meant the server client only checked
        // cookies and completely ignored the `Authorization: Bearer`
        // header that mobile clients send. Consume (/api/public/booking-
        // holds/[id]/consume) forwards the Bearer here, but this handler
        // dropped it on the floor and then returned 401 "Authentication
        // required" for every authenticated mobile booking — exactly the
        // bug reported on the customer payment flow. Pass the request
        // so Bearer is resolved the same way as cookies.
        const supabase = await getSupabaseServer(request);
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return errorResponse("Invalid request body.", "VALIDATION_ERROR", 400);
        }

        // §15.4-24 (audit 2026-04): server-side idempotency. If the caller
        // supplies a valid UUIDv4 `Idempotency-Key` header (or embeds one in
        // the body), return the original response for repeat calls within
        // 24h instead of double-creating a booking + charging the customer
        // twice. Silent no-op when the caller omits the key.
        const idempotencyKey = extractIdempotencyKey(request, body);
        if (idempotencyKey) {
          const cached = await lookupIdempotentResponse(
            PUBLIC_BOOKINGS_ENDPOINT,
            idempotencyKey,
          );
          if (cached) {
            return cached.toResponse();
          }
        }

        // Wave 1.5 (audit 2026-04 final 100/100): CAPTCHA guard for the
        // public POST surface. Previously the helper auto-bypassed the
        // check whenever ANY Supabase auth cookie or Bearer header was
        // present, which trivially defeated the guard via throwaway
        // accounts. We now do a Supabase-server auth check FIRST and only
        // skip CAPTCHA when the user is genuinely authenticated against
        // the auth backend (not just spoofed via headers).
        stage = "captcha";
        let captchaSkipUserId: string | null = null;
        try {
          const { data: pre } = await supabase.auth.getUser();
          captchaSkipUserId = pre?.user?.id ?? null;
        } catch {
          captchaSkipUserId = null;
        }
        const captchaResult = await verifyPublicBookingCaptcha(request, body, {
          skipForUserId: captchaSkipUserId,
        });
        if (captchaResult.ok === false) {
          return errorResponse(
            captchaResult.reason,
            "CAPTCHA_REQUIRED",
            captchaResult.status,
          );
        }

        stage = "validate_input";
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

        stage = "auth";
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

        stage = "tenant_resolve";
        const tenantRes = await requirePublicTenant(request);
        if (tenantRes instanceof Response) {
          return tenantRes;
        }
        const { tenantId: marketTenantId } = tenantRes;

        stage = "market_check";
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

        stage = "ensure_profile";
        // 2.5. Ensure user has a public profile (handles new sign-ins where trigger hasn't run yet)
        try {
          await ensureUserProfileForAuthUser(supabaseAdmin, user, marketTenantId, request);
        } catch (profileErr) {
          // §Risk-hardening 2026-04: ensureUserProfileForAuthUser raises
          // user-facing messages as plain Errors ("An account with this
          // email already exists", "We couldn't save your profile"). The
          // outer catch would mask them behind a generic 500. Translate
          // into the correct 4xx so the mobile client can render the real
          // message and the user can act on it.
          const msg = profileErr instanceof Error ? profileErr.message : "Failed to prepare profile.";
          if (/already exists/i.test(msg)) {
            return errorResponse(msg, "EMAIL_ACCOUNT_EXISTS", 409);
          }
          console.error("[public/bookings] ensure_profile failed:", profileErr);
          return errorResponse(msg, "PROFILE_PREPARE_FAILED", 500);
        }

        stage = "reschedule_cancel";
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

          // Notify waitlist entries about the freed slot
          try {
            const { matchWaitlistOnCancellation } = await import("@/lib/waitlist/matching");
            await matchWaitlistOnCancellation(supabaseAdmin, rescheduleBookingId);
          } catch (waitlistErr) {
            console.error("[reschedule] waitlist matching for old booking failed:", waitlistErr);
          }
        }

        stage = "stale_pending_cancel";
        // 2.7. Cancel any stale unpaid online bookings by this user for the same
        //      provider and nearby time window before conflict checks run.
        //      Auto-confirmed Paystack bookings can have status='confirmed' while
        //      payment_status='pending', so status-only cleanup leaves the
        //      customer's own abandoned payment attempt blocking the retry.
        {
          const selectedDt = new Date(draft.selected_datetime);
          const windowStart = new Date(selectedDt.getTime() - 4 * 60 * 60 * 1000); // -4 h
          const windowEnd   = new Date(selectedDt.getTime() + 4 * 60 * 60 * 1000); // +4 h
          // §Stale-cancel (audit 2026-06): a bulk UPDATE here cancelled abandoned
          // bookings but left their RESERVED gift card balance locked and any
          // upfront WALLET debit un-reversed. Select the matching ids and route
          // each through releaseBookingSlotAfterPaymentFailure, which voids the
          // gift card reservation, credits back the wallet amount, and clears the
          // coverage fields before cancelling.
          const { data: staleBookings } = await supabaseAdmin
            .from("bookings")
            .select("id")
            .eq("customer_id", user.id)
            .eq("provider_id", draft.provider_id)
            .eq("booking_source", "online")
            .eq("payment_status", "pending")
            .or("payment_provider.eq.paystack,payment_provider.is.null")
            .in("status", ["pending", "pending_payment", "confirmed"])
            .gte("scheduled_at", windowStart.toISOString())
            .lte("scheduled_at", windowEnd.toISOString());

          const staleIds = ((staleBookings as Array<{ id: string }> | null) ?? []).map((b) => b.id);
          if (staleIds.length > 0) {
            await Promise.all(
              staleIds.map((staleId) =>
                releaseBookingSlotAfterPaymentFailure(supabaseAdmin, staleId, user.id).catch(
                  (releaseErr) => {
                    console.error(
                      "[stale_pending_cancel] failed to release stale booking",
                      staleId,
                      releaseErr,
                    );
                  },
                ),
              ),
            );
          }
        }

        stage = "validate_forms";
        // 2.8. Server-side required provider-form validation.
        // Clients enforce this on-screen but a server backstop ensures the
        // constraint cannot be bypassed (e.g. via direct API calls or stale
        // client code). We load active forms with service_role so there is no
        // RLS restriction on the public endpoint.
        {
          const formResponses = validatedDraft.provider_form_responses ?? {};
          if (draft.provider_id) {
            const { data: activeForms } = await supabaseAdmin
              .from("provider_forms")
              .select("id, title, is_required, provider_form_fields(id, name, field_type, is_required)")
              .eq("provider_id", draft.provider_id)
              .eq("is_active", true);

            const formsWithFields = ((activeForms as Array<{
              id: string; title: string; is_required: boolean;
              provider_form_fields: Array<{ id: string; name: string; field_type: string; is_required: boolean }>;
            }> | null) ?? []).map((f) => ({ ...f, fields: f.provider_form_fields }));

            const missing = getMissingRequiredProviderFormField(formsWithFields, formResponses);
            if (missing) {
              return errorResponse(
                `Please complete the required form: "${missing.formTitle}" (${missing.fieldName}).`,
                "PROVIDER_FORM_REQUIRED",
                400,
              );
            }
          }
        }

        stage = "validate_booking";
        // 3. Validate booking (provider, services, pricing, conflicts, resources)
        const validationResult = await validateBooking(
          supabase,
          supabaseAdmin,
          draft,
          validatedDraft,
          user.id,
          marketTenantId,
          { skipMinNoticeCheck: true },
        );

        // If validation returned an error Response, forward it
        if (validationResult instanceof Response) {
          return validationResult;
        }

        const v = validationResult;

        stage = "create_booking";
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

        invalidateProviderBookingsReadCache(booking.provider_id);

        stage = "persist_forms";
        // 4a.b. B11: persist provider intake/consent/waiver responses and
        // booking-level custom field values now that the booking row exists.
        // Mirrors the /api/public/booking-holds/[id]/consume flow so the
        // canonical /booking flow and the /book/continue flow converge on the
        // same persistence model. Best-effort: a failure here must not kill
        // the booking (the row and its payment are already in motion).
        try {
          const providerFormResponses = validatedDraft.provider_form_responses;
          if (
            booking.id &&
            providerFormResponses &&
            Object.keys(providerFormResponses).length > 0
          ) {
            await supabaseAdmin
              .from("bookings")
              .update({ provider_form_responses: providerFormResponses })
              .eq("id", booking.id);
          }

          const customFieldValues = validatedDraft.custom_field_values;
          if (
            booking.id &&
            customFieldValues &&
            Object.keys(customFieldValues).length > 0
          ) {
            const { data: fields } = await supabaseAdmin
              .from("custom_fields")
              .select("id, name")
              .eq("entity_type", "booking")
              .eq("is_active", true);
            const nameToId = new Map(
              ((fields as Array<{ id: string; name: string }> | null) ?? []).map(
                (f) => [f.name, f.id],
              ),
            );
            for (const [name, value] of Object.entries(customFieldValues)) {
              const fieldId = nameToId.get(name);
              if (!fieldId) continue;
              await supabaseAdmin.from("custom_field_values").upsert(
                {
                  entity_type: "booking",
                  entity_id: booking.id,
                  custom_field_id: fieldId,
                  value: value == null ? "" : String(value),
                },
                { onConflict: "entity_type,entity_id,custom_field_id" },
              );
            }
          }
        } catch (formsErr) {
          console.error(
            "[public/bookings] failed to persist forms/custom fields:",
            formsErr,
          );
        }

        stage = "consume_hold";
        // 4b. Consume the hold so it no longer blocks availability
        if (validatedDraft.hold_id) {
          await supabaseAdmin
            .from("booking_holds")
            .update({ hold_status: "consumed", consuming_at: null })
            .eq("id", validatedDraft.hold_id)
            .in("hold_status", ["active", "consuming"]);
        }

        stage = "process_payment";
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

          const {
            paymentUrl,
            paymentReference,
            walletAmountApplied,
            giftCardAmountApplied,
            paystackAmount,
          } = paymentResult;
          bookingIdPendingRelease = "";

          stage = "post_effects";
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

          // 7. Return response — include price breakdown and display flags for confirmation screen
          const responseData = {
            booking_id: booking.id,
            booking_number: booking.booking_number,
            payment_url: paymentUrl,
            payment_reference: paymentReference ?? null,
            wallet_amount_applied: walletAmountApplied ?? 0,
            gift_card_amount_applied: giftCardAmountApplied ?? 0,
            paystack_amount: paystackAmount ?? 0,
            ...(recurring_subscription ? { recurring_subscription } : {}),
            // Display hints for confirmation screen — respect admin settings
            display: {
              show_platform_fee: v.showServiceFeeToCustomer,
              platform_fee_amount: v.serviceFeeAmount,
              // Deprecated aliases for active mobile/web clients.
              show_service_fee: v.showServiceFeeToCustomer,
              service_fee_amount: v.serviceFeeAmount,
              tax_amount: v.taxAmount,
              tax_rate: v.taxRate,
              tax_inclusive: v.taxIncluded,
            },
          };

          if (idempotencyKey) {
            stage = "idempotency_cache";
            // §15.4-24: cache the successful response body so repeat calls
            // with the same Idempotency-Key return the same booking_id +
            // payment_url instead of creating duplicates. Match the shape
            // used by successResponse({data, error:null}) so replay is
            // transparent to clients.
            await rememberIdempotentResponse(
              PUBLIC_BOOKINGS_ENDPOINT,
              idempotencyKey,
              {
                status: 200,
                body: { data: responseData, error: null },
                tenantId: (validatedDraft as { tenant_id?: string | null }).tenant_id ?? null,
                userId: user?.id ?? null,
              },
            );
          }

          return successResponse(responseData);
        } catch (paymentOrPostError) {
          if (bookingIdPendingRelease) {
            await releaseBookingSlotAfterPaymentFailure(supabaseAdmin, bookingIdPendingRelease, user.id);
          }
          throw paymentOrPostError;
        }
      } catch (error) {
        if (error instanceof z.ZodError) {
          const message = error.issues
            .map((issue) => {
              const field = issue.path.length > 0 ? issue.path.join(".") : null;
              return field ? `${field}: ${issue.message}` : issue.message;
            })
            .join(", ");
          return handleApiError(
            new Error(message),
            "Validation failed",
            "VALIDATION_ERROR",
            400
          );
        }
        // Surface the stage so Vercel logs + Sentry show exactly which step
        // of the public booking flow blew up, instead of a single opaque
        // "Failed to create booking" for every 500.
        console.error(
          `[public/bookings] 500 at stage=${stage}`,
          error instanceof Error ? { message: error.message, stack: error.stack } : error,
        );
        try {
          const withStage = error instanceof Error
            ? Object.assign(error, { bookingStage: stage })
            : error;
          return handleApiError(withStage, `Failed to create booking (stage: ${stage})`);
        } catch {
          return handleApiError(error, `Failed to create booking (stage: ${stage})`);
        }
      }
    },
  );
}
