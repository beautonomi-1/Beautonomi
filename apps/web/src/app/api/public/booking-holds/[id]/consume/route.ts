/**
 * POST /api/public/booking-holds/[id]/consume
 *
 * Convert a hold into a booking. Requires auth.
 * Called after guest completes Beautonomi Gate (OAuth/OTP).
 */

import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, errorResponse, normalizePhoneToE164 } from "@/lib/supabase/api-helpers";
import { requirePublicTenant } from "@/lib/tenant/require-public-tenant";
import { isGiftCardsEnabledForTenant } from "@/lib/subscriptions/entitlements";
import { checkBookingLimit } from "@/lib/subscriptions/limit-checker";
import { formatPublicCustomerBookingLimitMessage } from "@/lib/subscriptions/subscription-limit-messages";
import { evaluateMarketAvailabilityFromRequest } from "@/lib/tenant/market-availability";
import { bookingProductLineSchema } from "@/lib/public-booking/booking-draft-schema";
import { insertCustomerRecurringSeriesFromPaidBooking } from "@/lib/recurring/insert-customer-recurring-from-paid-booking";
import { subscribeRecurringEligible } from "@/lib/recurring/subscribe-recurring-eligibility";
import { z } from "zod";

const consumeBodySchema = z.object({
  client_info: z
    .object({
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      email: z.string().email().optional(),
      phone: z.string().optional(),
      phoneCountryCode: z.string().optional(),
    })
    .optional(),
  guest_fingerprint_hash: z.string().optional(),
  payment_method: z.enum(["card", "cash", "giftcard"]).optional(),
  payment_option: z.enum(["deposit", "full"]).optional(),
  payment_method_id: z.string().uuid().optional().nullable(),
  use_wallet: z.boolean().optional(),
  save_card: z.boolean().optional(),
  set_as_default: z.boolean().optional(),
  gift_card_code: z.string().optional(),
  custom_field_values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  provider_form_responses: z.record(
    z.string(),
    z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
  ).optional(),
  addons: z.array(z.string().uuid()).optional(),
  special_requests: z.string().optional().nullable(),
  house_call_instructions: z.string().optional().nullable(),
  tip_amount: z.number().min(0).optional(),
  promotion_code: z.string().optional().nullable(),
  is_group_booking: z.boolean().optional(),
  group_participants: z
    .array(
      z.object({
        name: z.string(),
        email: z.string().optional().nullable(),
        phone: z.string().optional().nullable(),
        service_ids: z.array(z.string().uuid()),
        notes: z.string().optional().nullable(),
      })
    )
    .optional()
    .nullable(),
  resource_ids: z.array(z.string().uuid()).optional(),
  reschedule_booking_id: z.string().uuid().optional(),
  products: z.array(bookingProductLineSchema).optional(),
  package_id: z.string().uuid().optional().nullable(),
  /** Alias for `package_id` (e.g. mobile / analytics naming) — same `service_packages.id` on the booking */
  primary_package_id: z.string().uuid().optional().nullable(),
  customer_package_entitlement_id: z.string().uuid().optional().nullable(),
  loyalty_points_used: z.number().min(0).optional(),
  membership_plan_id: z.string().uuid().optional().nullable(),
  /** Create customer recurring series: immediate when no Paystack redirect; otherwise after charge.success (Paystack metadata). */
  subscribe_recurring: z
    .object({
      enabled: z.boolean(),
      frequency: z.enum(["weekly", "biweekly", "monthly"]),
    })
    .optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let holdIdForRelease: string | null = null;
  let adminSupabaseForRelease: Awaited<ReturnType<typeof getSupabaseAdmin>> | null = null;
  try {
    const { id: holdId } = await params;
    holdIdForRelease = holdId;

    if (!holdId) {
      return handleApiError(
        new Error("Hold ID is required"),
        "Hold ID is required",
        "VALIDATION_ERROR",
        400
      );
    }

    const supabase = await getSupabaseServer(request);
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return handleApiError(
        new Error("Authentication required"),
        "Please sign in to complete your booking",
        "AUTH_REQUIRED",
        401
      );
    }

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
        451
      );
    }

    const body = await request.json();
    const parsed = consumeBodySchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        "Invalid request body.",
        "VALIDATION_ERROR",
        400
      );
    }
    const clientInfo = parsed.data.client_info;
    const guestFingerprint = parsed.data.guest_fingerprint_hash;
    const paymentMethod = parsed.data.payment_method;
    const paymentMethodId = parsed.data.payment_method_id;
    const paymentOption = parsed.data.payment_option;
    const useWallet = parsed.data.use_wallet;
    const giftCardCode = parsed.data.gift_card_code;
    const customFieldValues = parsed.data.custom_field_values;
    const providerFormResponses = parsed.data.provider_form_responses;
    const addons = parsed.data.addons;
    const specialRequests = parsed.data.special_requests;
    const houseCallInstructions = parsed.data.house_call_instructions;
    const tipAmount = parsed.data.tip_amount;
    const promotionCode = parsed.data.promotion_code;
    const isGroupBooking = parsed.data.is_group_booking;
    const groupParticipants = parsed.data.group_participants;
    const resourceIdsFromBody = parsed.data.resource_ids;
    const saveCard = parsed.data.save_card;
    const setAsDefault = parsed.data.set_as_default;
    const rescheduleBookingId = parsed.data.reschedule_booking_id;
    const products = parsed.data.products;
    const packageId = (parsed.data.package_id ?? parsed.data.primary_package_id) ?? undefined;
    const customerPackageEntitlementId = parsed.data.customer_package_entitlement_id;
    const loyaltyPointsUsed = parsed.data.loyalty_points_used;
    const membershipPlanId = parsed.data.membership_plan_id;
    const subscribeRecurringReq = parsed.data.subscribe_recurring;

    if (giftCardCode?.trim()) {
      const giftCardsEnabled = await isGiftCardsEnabledForTenant(marketTenantId);
      if (!giftCardsEnabled) {
        return errorResponse(
          "Gift cards are currently unavailable.",
          "FEATURE_DISABLED",
          400
        );
      }
    }

    const adminSupabase = getSupabaseAdmin();
    adminSupabaseForRelease = adminSupabase;

    const { data: marketTenant } = await adminSupabase
      .from("tenants")
      .select("slug")
      .eq("id", marketTenantId)
      .maybeSingle();
    if ((marketTenant as { slug?: string } | null)?.slug === "global") {
      return handleApiError(
        new Error("Bookings are unavailable on global entry"),
        "Please switch to an available market to continue booking.",
        "MARKET_SWITCH_REQUIRED",
        403
      );
    }

    // B4: atomic claim. `claim_booking_hold_for_consume` flips hold_status
    // from 'active' → 'consuming' in a single SQL round-trip, protecting
    // against two parallel /consume calls both racing past the guard below.
    const { data: claimedRow, error: claimError } = await (adminSupabase.rpc as any)(
      "claim_booking_hold_for_consume",
      { p_hold_id: holdId },
    );
    if (claimError) {
      console.error("[booking-holds/consume] claim RPC failed", claimError);
      return handleApiError(
        claimError,
        "Unable to claim booking hold.",
        "HOLD_CLAIM_ERROR",
        500,
      );
    }

    const hold = (claimedRow as any) || null;
    if (!hold || !hold.id) {
      // Could not claim — either the hold is missing, already consumed,
      // expired, cancelled, or another worker is mid-consume.
      const { data: currentHold } = await adminSupabase
        .from("booking_holds")
        .select("id, hold_status, expires_at")
        .eq("id", holdId)
        .maybeSingle();

      if (!currentHold) {
        return handleApiError(
          new Error("Hold not found"),
          "Hold not found or expired",
          "NOT_FOUND",
          404,
        );
      }

      const status = (currentHold as { hold_status?: string }).hold_status;
      const expiresAtRaw = (currentHold as { expires_at?: string }).expires_at;
      if (status === "expired" || (expiresAtRaw && new Date(expiresAtRaw) < new Date())) {
        return handleApiError(
          new Error("Hold has expired"),
          "Your hold has expired. Please select a new time.",
          "HOLD_EXPIRED",
          410,
        );
      }
      if (status === "consumed") {
        return handleApiError(
          new Error("Hold already consumed"),
          "This booking has already been completed.",
          "HOLD_CONSUMED",
          410,
        );
      }
      if (status === "consuming") {
        return handleApiError(
          new Error("Hold is being consumed"),
          "This booking is already being processed. Please wait a moment and retry.",
          "HOLD_IN_FLIGHT",
          409,
        );
      }
      return handleApiError(
        new Error("Hold is no longer active"),
        "This slot is no longer available.",
        "HOLD_INACTIVE",
        410,
      );
    }

    const { data: holdProviderRow } = await adminSupabase
      .from("providers")
      .select("tenant_id")
      .eq("id", hold.provider_id)
      .maybeSingle();
    if (!holdProviderRow || (holdProviderRow as { tenant_id?: string }).tenant_id !== marketTenantId) {
      // Release the consuming lease so the customer isn't stuck.
      await (adminSupabase.rpc as any)("release_booking_hold_from_consume", { p_hold_id: holdId });
      return handleApiError(
        new Error("Hold not available on this site"),
        "This booking link is not valid here.",
        "TENANT_MISMATCH",
        404
      );
    }

    const releaseHold = async () => {
      try {
        await (adminSupabase.rpc as any)("release_booking_hold_from_consume", {
          p_hold_id: holdId,
        });
      } catch (releaseErr) {
        console.warn("[booking-holds/consume] failed to release hold", releaseErr);
      }
    };

    const bookingLimitCheck = await checkBookingLimit(hold.provider_id);
    if (!bookingLimitCheck.canProceed) {
      const publicMessage = formatPublicCustomerBookingLimitMessage(bookingLimitCheck);
      console.error("[booking-holds/consume] booking limit denied", hold.provider_id, {
        internalReason: bookingLimitCheck.reason,
        planName: bookingLimitCheck.planName,
      });
      await releaseHold();
      return handleApiError(
        new Error(`Booking limit: ${bookingLimitCheck.reason}`),
        publicMessage,
        "SUBSCRIPTION_LIMIT_EXCEEDED",
        403
      );
    }

    // Verify ownership of the hold. Allow when any of the following is true:
    //   1. The authenticated user owns the hold directly (`created_by_user_id`
    //      matches the current session).
    //   2. The hold was created anonymously AND the device's
    //      `guest_fingerprint_hash` matches — the pre-account-link flow.
    //   3. The hold was created anonymously (no `created_by_user_id`) by a
    //      guest and the user has since authenticated. §Customer-audit
    //      2026-04: we used to 403 here when a fingerprint had been stored
    //      but the mobile client had since re-minted its guest-fingerprint
    //      cookie (e.g. after a fresh install, a locale change, or the
    //      keychain being cleared). The practical impact was "You don't
    //      have permissions to complete this booking" even though the
    //      user had just signed in with the email attached to the draft.
    //      Authenticated + guest-hold is now acceptable because the
    //      `/api/public/bookings` handler re-validates the slot and binds
    //      it to the auth user, giving us the same slot-squatting defence.
    //   4. The hold was authored by a different authed user but its
    //      `client_info.email` (from the bookings draft we're about to
    //      forward) matches the signed-in user — covers the mobile app's
    //      "continue as this account" branch where we transfer holds after
    //      gate auth.
    const userOwnsHold = hold.created_by_user_id === user.id;
    const storedFingerprint = hold.guest_fingerprint_hash as string | null;
    const fingerprintMatch = Boolean(storedFingerprint) && guestFingerprint === storedFingerprint;
    const isGuestHold = hold.created_by_user_id === null;
    const clientEmail = clientInfo?.email?.trim().toLowerCase() ?? "";
    const userEmail = (user.email ?? "").toLowerCase();
    const emailMatchesAuthUser =
      clientEmail.length > 0 && userEmail.length > 0 && clientEmail === userEmail;

    const ownershipAllowed =
      userOwnsHold || fingerprintMatch || isGuestHold || emailMatchesAuthUser;

    if (!ownershipAllowed) {
      await releaseHold();
      console.warn("[booking-holds/consume] HOLD_OWNERSHIP denied", {
        hold_id: holdId,
        hold_author: hold.created_by_user_id,
        auth_user: user.id,
        fingerprint_stored: Boolean(storedFingerprint),
        fingerprint_provided: Boolean(guestFingerprint),
        fingerprint_match: fingerprintMatch,
        email_match: emailMatchesAuthUser,
      });
      return handleApiError(
        new Error("Hold does not belong to this session"),
        "This booking slot has already been claimed. Please pick a new time to continue.",
        "HOLD_OWNERSHIP",
        403
      );
    }

    // Self-heal: once we've allowed an authenticated user to consume a
    // previously-guest hold, bind the hold to them so any downstream lookups
    // (idempotency, analytics) resolve cleanly.
    if (!userOwnsHold) {
      try {
        await adminSupabase
          .from("booking_holds")
          .update({ created_by_user_id: user.id })
          .eq("id", holdId)
          .is("created_by_user_id", null);
      } catch (bindErr) {
        console.warn("[booking-holds/consume] failed to bind hold to auth user", bindErr);
      }
    }

    // Build booking draft from hold snapshot
    const snapshot = hold.booking_services_snapshot as Array<{
      offering_id: string;
      staff_id: string | null;
      duration_minutes: number;
      price: number;
      currency: string;
      scheduled_start_at: string;
      scheduled_end_at: string;
    }>;

    const services = snapshot.map((s) => ({
      offering_id: s.offering_id,
      staff_id: s.staff_id,
    }));

    // Normalize to ISO 8601 so /api/public/bookings Zod datetime() accepts it (DB may return different format)
    const selectedDatetime = new Date(hold.start_at).toISOString();

    const address = hold.address_snapshot as Record<string, any> | null;
    const addressFormatted =
      hold.location_type === "at_home" && address
        ? {
            line1: String(address.line1 ?? address.address_line1 ?? ""),
            line2: address.line2 as string | undefined,
            city: String(address.city ?? address.address_city ?? ""),
            state: (address.state ?? address.address_state) as string | undefined,
            country: String(address.country ?? address.address_country ?? ""),
            postal_code: (address.postal_code ?? address.address_postal_code) as string | undefined,
            latitude: address.latitude as number | undefined,
            longitude: address.longitude as number | undefined,
            apartment_unit: (address.apartment_unit ?? null) as string | null | undefined,
            building_name: (address.building_name ?? null) as string | null | undefined,
            floor_number: (address.floor_number ?? null) as string | null | undefined,
            access_codes: (address.access_codes ?? null) as Record<string, string> | null | undefined,
            parking_instructions: (address.parking_instructions ?? null) as string | null | undefined,
            location_landmarks: (address.location_landmarks ?? null) as string | null | undefined,
          }
        : undefined;

    const holdMeta = (hold.metadata as Record<string, any>) || {};
    const travelFeeFromHold = holdMeta.travel_fee != null ? Number(holdMeta.travel_fee) : 0;
    const resourceIdsFromHold = Array.isArray(holdMeta.resource_ids)
      ? (holdMeta.resource_ids as string[]).filter((id) => typeof id === "string")
      : undefined;

    const cc = clientInfo?.phoneCountryCode || "27";
    const normalizedClientInfo = clientInfo
      ? {
          firstName: clientInfo.firstName,
          lastName: clientInfo.lastName,
          email: clientInfo.email?.trim() || undefined,
          phone: clientInfo.phone
            ? normalizePhoneToE164(clientInfo.phone, cc) || clientInfo.phone.trim() || undefined
            : undefined,
        }
      : undefined;

    const draft: Record<string, any> = {
      provider_id: hold.provider_id,
      services,
      selected_datetime: selectedDatetime,
      location_type: hold.location_type,
      location_id: hold.location_id,
      address: addressFormatted,
      travel_fee: travelFeeFromHold,
      client_info: normalizedClientInfo ?? {
        firstName: user.user_metadata?.full_name?.split(" ")[0] ?? "Guest",
        lastName: user.user_metadata?.full_name?.split(" ").slice(1).join(" ") ?? "User",
        email: user.email ?? undefined,
        phone: user.user_metadata?.phone ?? undefined,
      },
      payment_method: paymentMethod ?? "card",
      payment_option: paymentOption ?? "deposit",
      payment_method_id: paymentMethodId ?? undefined,
      use_wallet: useWallet ?? false,
      save_card: saveCard ?? undefined,
      set_as_default: setAsDefault ?? undefined,
      gift_card_code: giftCardCode ?? null,
      booking_source: "online" as const,
      hold_id: holdId,
      addons: addons ?? undefined,
      special_requests: specialRequests ?? undefined,
      house_call_instructions: houseCallInstructions ?? undefined,
      tip_amount: tipAmount ?? undefined,
      promotion_code: promotionCode ?? undefined,
      reschedule_booking_id: rescheduleBookingId ?? undefined,
      customer_package_entitlement_id: customerPackageEntitlementId ?? undefined,
      loyalty_points_used: loyaltyPointsUsed ?? undefined,
      membership_plan_id: membershipPlanId ?? undefined,
    };
    if (isGroupBooking === true && Array.isArray(groupParticipants) && groupParticipants.length > 0) {
      draft.is_group_booking = true;
      draft.group_participants = groupParticipants;
    }
    if (products && products.length > 0) {
      draft.products = products;
    }
    if (packageId) {
      draft.package_id = packageId;
    }
    const resourceIds = resourceIdsFromBody ?? resourceIdsFromHold;
    if (resourceIds && resourceIds.length > 0) {
      draft.resource_ids = resourceIds;
    }

    if (
      subscribeRecurringReq?.enabled === true &&
      subscribeRecurringEligible({
        subscribe_recurring: { enabled: true, frequency: subscribeRecurringReq.frequency },
        reschedule_booking_id: rescheduleBookingId ?? null,
        is_group_booking: isGroupBooking,
        has_group_participants: Boolean(
          groupParticipants && Array.isArray(groupParticipants) && groupParticipants.length > 0,
        ),
      })
    ) {
      draft.subscribe_recurring = {
        enabled: true,
        frequency: subscribeRecurringReq.frequency,
      };
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL
        ? process.env.NEXT_PUBLIC_APP_URL
        : process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : new URL(request.url).origin;

    const cookieHeader = request.headers.get("cookie") || "";
    /** Mobile apps authenticate with Bearer tokens only (no session cookies). Inner fetch must forward them or /api/public/bookings sees no user → 401 and checkout fails. */
    const authorizationHeader = request.headers.get("authorization")?.trim();
    const activeMarketCountry = request.headers.get("x-active-market-country")?.trim();

    const forwardHost =
      request.headers.get("x-forwarded-host")?.trim() ||
      request.headers.get("host")?.trim() ||
      "";

    const paymentForwardAbort = new AbortController();
    const paymentForwardTimer = setTimeout(() => paymentForwardAbort.abort(), 120_000);
    let bookingRes: Response;
    try {
      bookingRes = await fetch(`${baseUrl}/api/public/bookings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(cookieHeader ? { Cookie: cookieHeader } : {}),
          ...(authorizationHeader ? { Authorization: authorizationHeader } : {}),
          ...(forwardHost ? { "x-forwarded-host": forwardHost } : {}),
          ...(activeMarketCountry ? { "x-active-market-country": activeMarketCountry } : {}),
        },
        body: JSON.stringify(draft),
        signal: paymentForwardAbort.signal,
      });
    } catch (fetchErr) {
      clearTimeout(paymentForwardTimer);
      await releaseHold();
      throw fetchErr;
    } finally {
      clearTimeout(paymentForwardTimer);
    }

    const bookingData = await bookingRes.json();

    if (!bookingRes.ok) {
      const errMsg =
        bookingData?.error?.message ||
        `Booking failed (${bookingRes.status})`;
      await releaseHold();
      return handleApiError(
        new Error(errMsg),
        errMsg,
        bookingData?.error?.code || "BOOKING_FAILED",
        bookingRes.status
      );
    }

    // Mark hold as consumed (transition from `consuming` → `consumed`).
    await adminSupabase
      .from("booking_holds")
      .update({
        hold_status: "consumed",
        consuming_at: null,
        created_by_user_id: user.id,
        metadata: {
          ...((hold.metadata as Record<string, any>) || {}),
          booking_id: bookingData?.data?.booking_id,
          consumed_at: new Date().toISOString(),
        },
      })
      .eq("id", holdId)
      .eq("hold_status", "consuming");

    // Save custom field values for the new booking (user session has access via RLS)
    const bookingId = bookingData?.data?.booking_id;
    if (bookingId && customFieldValues && Object.keys(customFieldValues).length > 0) {
      const { data: fields } = await supabase
        .from("custom_fields")
        .select("id, name")
        .eq("entity_type", "booking")
        .eq("is_active", true);
      const nameToId = new Map((fields || []).map((f) => [f.name, f.id]));
      for (const [name, value] of Object.entries(customFieldValues)) {
        const fieldId = nameToId.get(name);
        if (!fieldId) continue;
        await supabase.from("custom_field_values").upsert(
          {
            entity_type: "booking",
            entity_id: bookingId,
            custom_field_id: fieldId,
            value: value == null ? "" : String(value),
          },
          { onConflict: "entity_type,entity_id,custom_field_id" }
        );
      }
    }

    if (bookingId && providerFormResponses && Object.keys(providerFormResponses).length > 0) {
      await adminSupabase
        .from("bookings")
        .update({ provider_form_responses: providerFormResponses })
        .eq("id", bookingId);
    }

    let recurring_subscription:
      | { created: true }
      | { created: false; pending?: true; message?: string }
      | undefined;

    if (subscribeRecurringReq?.enabled === true) {
      if (!bookingId) {
        recurring_subscription = { created: false, message: "Booking was not created." };
      } else if (rescheduleBookingId) {
        recurring_subscription = { created: false, message: "Not available when rescheduling." };
      } else if (
        isGroupBooking === true &&
        Array.isArray(groupParticipants) &&
        groupParticipants.length > 0
      ) {
        recurring_subscription = { created: false, message: "Not available for group bookings." };
      } else if (bookingData?.data?.payment_url) {
        recurring_subscription = { created: false, pending: true };
      } else {
        const recurringPay = paymentMethod === "cash" ? "cash" : "card";
        const subResult = await insertCustomerRecurringSeriesFromPaidBooking({
          admin: adminSupabase,
          bookingId,
          customerId: user.id,
          frequency: subscribeRecurringReq.frequency,
          paymentMethod: recurringPay,
        });
        if (subResult.ok === false) {
          recurring_subscription = { created: false, message: subResult.message };
        } else {
          recurring_subscription = { created: true };
        }
      }
    }

    return successResponse({
      booking_id: bookingData?.data?.booking_id,
      booking_number: bookingData?.data?.booking_number,
      payment_url: bookingData?.data?.payment_url,
      ...(recurring_subscription ? { recurring_subscription } : {}),
    });
  } catch (error) {
    // Best-effort release of any `consuming` lease so the customer can retry
    // without waiting for the expiry cron.
    if (holdIdForRelease && adminSupabaseForRelease) {
      try {
        await (adminSupabaseForRelease.rpc as any)(
          "release_booking_hold_from_consume",
          { p_hold_id: holdIdForRelease },
        );
      } catch (releaseErr) {
        console.warn("[booking-holds/consume] failed to release hold on error", releaseErr);
      }
    }
    return handleApiError(error, "Failed to complete booking");
  }
}
