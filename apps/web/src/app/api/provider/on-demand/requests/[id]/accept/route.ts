import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { validateBooking } from "@/app/api/public/bookings/_helpers/validate-booking";
import { createBookingRecord } from "@/app/api/public/bookings/_helpers/create-booking-record";
import type { PublicBookingValidatedBody } from "@/lib/public-booking/booking-draft-schema";
import type { BookingDraft } from "@/types/beautonomi";

/**
 * POST /api/provider/on-demand/requests/[id]/accept
 * Accept an on-demand request: create booking from request_payload, then single UPDATE
 * (status + booking_id) so realtime sends one state and customer can navigate to booking.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request
    );
    const { id } = await params;
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return errorResponse("Provider not found", "NOT_FOUND", 404);

    const now = new Date().toISOString();
    const { data: requestRow, error: fetchError } = await supabase
      .from("on_demand_requests")
      .select("*")
      .eq("id", id)
      .eq("provider_id", providerId)
      .eq("status", "requested")
      .gt("expires_at", now)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!requestRow) {
      return errorResponse(
        "Request already handled or expired",
        "ALREADY_HANDLED_OR_EXPIRED",
        409
      );
    }

    const customerId = requestRow.customer_id as string;
    const requestPayload = (requestRow.request_payload ?? {}) as Record<string, unknown>;
    const admin = getSupabaseAdmin();

    // Enrich client_info from users if missing so booking gets guest_name
    const existingClientInfo = requestPayload.client_info as { firstName?: string; lastName?: string } | undefined;
    if (!existingClientInfo?.firstName && !existingClientInfo?.lastName) {
      const { data: userRow } = await admin
        .from("users")
        .select("full_name")
        .eq("id", customerId)
        .single();
      const fullName = (userRow?.full_name as string)?.trim() || "";
      if (fullName) {
        const parts = fullName.split(/\s+/);
        const firstName = parts[0] ?? "";
        const lastName = parts.slice(1).join(" ") ?? "";
        requestPayload.client_info = { firstName, lastName };
      }
    }

    // Build draft from request_payload (same shape as booking create body)
    const draft: BookingDraft = {
      provider_id: requestRow.provider_id as string,
      services: Array.isArray(requestPayload.services)
        ? (requestPayload.services as { offering_id: string; staff_id?: string }[]).map((s) => ({
            offering_id: s.offering_id,
            staff_id: s.staff_id ?? undefined,
          }))
        : [],
      selected_datetime:
        typeof requestPayload.selected_datetime === "string"
          ? requestPayload.selected_datetime
          : new Date().toISOString(),
      location_type:
        requestPayload.location_type === "at_salon" ? "at_salon" : "at_home",
      location_id:
        typeof requestPayload.location_id === "string"
          ? requestPayload.location_id
          : undefined,
      address:
        requestPayload.address && typeof requestPayload.address === "object"
          ? (requestPayload.address as BookingDraft["address"])
          : undefined,
      guests: [],
      addons: Array.isArray(requestPayload.addons) ? requestPayload.addons : [],
      products: Array.isArray(requestPayload.products) ? requestPayload.products : undefined,
      package_id:
        typeof requestPayload.package_id === "string"
          ? requestPayload.package_id
          : undefined,
      tip_amount: Number(requestPayload.tip_amount) || 0,
      travel_fee: Number(requestPayload.travel_fee) || undefined,
      special_requests:
        typeof requestPayload.special_requests === "string"
          ? requestPayload.special_requests
          : undefined,
      client_info: requestPayload.client_info as BookingDraft["client_info"],
      payment_method:
        requestPayload.payment_method === "cash" ||
        requestPayload.payment_method === "giftcard"
          ? requestPayload.payment_method
          : "card",
      payment_option:
        requestPayload.payment_option === "deposit" ? "deposit" : "full",
      promotion_code:
        typeof requestPayload.promotion_code === "string"
          ? requestPayload.promotion_code
          : undefined,
      gift_card_code:
        typeof requestPayload.gift_card_code === "string"
          ? requestPayload.gift_card_code
          : undefined,
      use_wallet: Boolean(requestPayload.use_wallet),
    };

    const validatedDraft = { ...requestPayload } as unknown as PublicBookingValidatedBody;

    const validationResult = await validateBooking(
      supabase,
      admin,
      draft,
      validatedDraft,
      customerId,
      undefined,
      { skipMinNoticeCheck: true }
    );

    if (validationResult instanceof Response) {
      return validationResult;
    }

    const createResult = await createBookingRecord(
      supabase,
      admin,
      draft,
      validatedDraft,
      validationResult,
      customerId
    );

    if (createResult instanceof Response) {
      return createResult;
    }

    const { booking } = createResult;

    // Single UPDATE so realtime sends status + booking_id together; customer can go straight to booking-detail
    const { data: updatedRow, error: updateError } = await admin
      .from("on_demand_requests")
      .update({
        status: "accepted",
        accepted_at: now,
        booking_id: booking.id,
        updated_at: now,
      })
      .eq("id", id)
      .eq("provider_id", providerId)
      .eq("status", "requested")
      .gt("expires_at", now)
      .select()
      .maybeSingle();

    if (updateError) throw updateError;
    if (!updatedRow) {
      return errorResponse(
        "Request already handled or expired",
        "ALREADY_HANDLED_OR_EXPIRED",
        409
      );
    }

    // Notify customer
    await admin.from("notifications").insert({
      user_id: customerId,
      type: "booking_confirmation",
      title: "Request accepted",
      message: "Your request has been accepted. View your booking for details.",
      data: {
        subtype: "on_demand_accepted",
        on_demand_request_id: id,
        booking_id: booking.id,
      },
    });

    try {
      const { sendToUsers } = await import("@/lib/notifications/onesignal");
      await sendToUsers(
        [customerId],
        {
          title: "Request accepted",
          message: "Your booking has been confirmed. Tap to view details.",
          data: {
            type: "booking_confirmation",
            booking_id: booking.id,
            on_demand_request_id: id,
            subtype: "on_demand_accepted",
          },
        },
        ["push"],
        { appType: "customer", supabaseClient: admin }
      );
    } catch (pushErr) {
      console.error("Failed to send on-demand accept push to customer:", pushErr);
    }

    return successResponse({
      request: updatedRow,
      booking_id: booking.id,
    });
  } catch (error) {
    return handleApiError(error as Error, "Failed to accept on-demand request");
  }
}
