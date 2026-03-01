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
import { isFeatureEnabledServer } from "@/lib/server/feature-flags";
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
  use_wallet: z.boolean().optional(),
  gift_card_code: z.string().optional(),
  custom_field_values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  provider_form_responses: z.record(
    z.string(),
    z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
  ).optional(),
  addons: z.array(z.string().uuid()).optional(),
  special_requests: z.string().optional().nullable(),
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
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: holdId } = await params;

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

    const body = await request.json();
    const parsed = consumeBodySchema.safeParse(body);
    const clientInfo = parsed.success ? parsed.data.client_info : undefined;
    const guestFingerprint = parsed.success ? parsed.data.guest_fingerprint_hash : undefined;
    const paymentMethod = parsed.success ? parsed.data.payment_method : undefined;
    const paymentOption = parsed.success ? parsed.data.payment_option : undefined;
    const useWallet = parsed.success ? parsed.data.use_wallet : undefined;
    const giftCardCode = parsed.success ? parsed.data.gift_card_code : undefined;
    const customFieldValues = parsed.success ? parsed.data.custom_field_values : undefined;
    const providerFormResponses = parsed.success ? parsed.data.provider_form_responses : undefined;
    const addons = parsed.success ? parsed.data.addons : undefined;
    const specialRequests = parsed.success ? parsed.data.special_requests : undefined;
    const tipAmount = parsed.success ? parsed.data.tip_amount : undefined;
    const promotionCode = parsed.success ? parsed.data.promotion_code : undefined;
    const isGroupBooking = parsed.success ? parsed.data.is_group_booking : undefined;
    const groupParticipants = parsed.success ? parsed.data.group_participants : undefined;
    const resourceIdsFromBody = parsed.success ? parsed.data.resource_ids : undefined;

    if (giftCardCode?.trim()) {
      const giftCardsEnabled = await isFeatureEnabledServer("gift_cards");
      if (!giftCardsEnabled) {
        return errorResponse(
          "Gift cards are currently unavailable.",
          "FEATURE_DISABLED",
          400
        );
      }
    }

    const adminSupabase = getSupabaseAdmin();

    const { data: hold, error: holdError } = await adminSupabase
      .from("booking_holds")
      .select("*")
      .eq("id", holdId)
      .single();

    if (holdError || !hold) {
      return handleApiError(
        new Error("Hold not found"),
        "Hold not found or expired",
        "NOT_FOUND",
        404
      );
    }

    if (hold.hold_status !== "active") {
      return handleApiError(
        new Error("Hold is no longer active"),
        hold.hold_status === "expired"
          ? "Your hold has expired. Please select a new time."
          : "This slot is no longer available.",
        "HOLD_INACTIVE",
        410
      );
    }

    const expiresAt = new Date(hold.expires_at);
    if (expiresAt < new Date()) {
      return handleApiError(
        new Error("Hold has expired"),
        "Your hold has expired. Please select a new time.",
        "HOLD_EXPIRED",
        410
      );
    }

    // Verify ownership: user created it, guest fingerprint matches, or guest hold (created before auth)
    const userOwnsHold = hold.created_by_user_id === user.id;
    const fingerprintMatch =
      hold.guest_fingerprint_hash &&
      guestFingerprint &&
      hold.guest_fingerprint_hash === guestFingerprint;
    // Guest hold: created before auth; user completed OAuth and landed on /book/continue?hold_id=...
    const isGuestHold = hold.created_by_user_id === null;

    if (!userOwnsHold && !fingerprintMatch && !isGuestHold) {
      return handleApiError(
        new Error("Hold does not belong to this session"),
        "This hold cannot be used. Please start a new booking.",
        "HOLD_OWNERSHIP",
        403
      );
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

    const selectedDatetime = hold.start_at;

    const address = hold.address_snapshot as Record<string, unknown> | null;
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
          }
        : undefined;

    const holdMeta = (hold.metadata as Record<string, unknown>) || {};
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

    const draft: Record<string, unknown> = {
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
      use_wallet: useWallet ?? false,
      gift_card_code: giftCardCode ?? null,
      booking_source: "online" as const,
      hold_id: holdId,
      addons: addons ?? undefined,
      special_requests: specialRequests ?? undefined,
      tip_amount: tipAmount ?? undefined,
      promotion_code: promotionCode ?? undefined,
    };
    if (isGroupBooking === true && Array.isArray(groupParticipants) && groupParticipants.length > 0) {
      draft.is_group_booking = true;
      draft.group_participants = groupParticipants;
    }
    const resourceIds = resourceIdsFromBody ?? resourceIdsFromHold;
    if (resourceIds && resourceIds.length > 0) {
      draft.resource_ids = resourceIds;
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : new URL(request.url).origin;

    const cookieHeader = request.headers.get("cookie") || "";

    const bookingRes = await fetch(`${baseUrl}/api/public/bookings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader,
      },
      body: JSON.stringify(draft),
    });

    const bookingData = await bookingRes.json();

    if (!bookingRes.ok) {
      const errMsg =
        bookingData?.error?.message ||
        `Booking failed (${bookingRes.status})`;
      return handleApiError(
        new Error(errMsg),
        errMsg,
        bookingData?.error?.code || "BOOKING_FAILED",
        bookingRes.status
      );
    }

    // Mark hold as consumed
    await adminSupabase
      .from("booking_holds")
      .update({
        hold_status: "consumed",
        created_by_user_id: user.id,
        metadata: {
          ...((hold.metadata as Record<string, unknown>) || {}),
          booking_id: bookingData?.data?.booking_id,
          consumed_at: new Date().toISOString(),
        },
      })
      .eq("id", holdId);

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

    return successResponse({
      booking_id: bookingData?.data?.booking_id,
      booking_number: bookingData?.data?.booking_number,
      payment_url: bookingData?.data?.payment_url,
    });
  } catch (error) {
    return handleApiError(error, "Failed to complete booking");
  }
}
