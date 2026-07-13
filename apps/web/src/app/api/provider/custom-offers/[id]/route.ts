import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requireRoleInApi } from "@/lib/supabase/api-helpers";
import { patchCustomOfferMessageAttachments } from "@/lib/custom-offers/sync-offer-message-attachments";
import { getNotificationTemplate, sendTemplateNotification, sendToUser } from "@/lib/notifications/onesignal";

const updateOfferSchema = z.object({
  price: z.number().min(0),
  currency: z.string().min(3).max(5).optional(),
  duration_minutes: z.number().int().min(15).max(8 * 60),
  expiration_at: z.string(),
  notes: z.string().max(4000).optional().nullable(),
  staff_id: z.string().uuid().optional().nullable(),
  location_id: z.string().uuid().optional().nullable(),
  scheduled_at: z.string().optional().nullable(),
  travel_fee: z.number().min(0).optional().nullable(),
});

/**
 * GET /api/provider/custom-offers/[id]
 * Fetch a single offer with its request for editing/resend. Provider must own the offer.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const { id: offerId } = await params;

    const { data: row, error } = await supabase
      .from("custom_offers")
      .select(`
        id,
        request_id,
        provider_id,
        price,
        currency,
        duration_minutes,
        expiration_at,
        notes,
        staff_id,
        travel_fee,
        change_request_note,
        changes_requested_at,
        status,
        booking_id,
        paid_at,
        request:custom_requests(
          id,
          customer_id,
          provider_id,
          service_category_id,
          service_name,
          location_type,
          description,
          preferred_start_at,
          address_line1,
          address_line2,
          address_city,
          address_state,
          address_country,
          address_postal_code
        )
      `)
      .eq("id", offerId)
      .single();

    if (error || !row) return notFoundResponse("Offer not found");
    const offer = row as any;
    if (offer.provider_id !== providerId) return notFoundResponse("Offer not found");

    return successResponse(offer);
  } catch (error) {
    return handleApiError(error, "Failed to fetch offer");
  }
}

/**
 * PATCH /api/provider/custom-offers/[id]
 * Edit a pending or changes_requested offer in place.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const supabaseAdmin = getSupabaseAdmin();
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const { id: offerId } = await params;
    const parsed = updateOfferSchema.parse(await request.json());

    const { data: offer, error: offerError } = await supabase
      .from("custom_offers")
      .select("id, provider_id, status, request_id, currency")
      .eq("id", offerId)
      .single();

    if (offerError || !offer) return notFoundResponse("Offer not found");
    const offerData = offer as {
      id: string;
      provider_id: string;
      status: string;
      request_id?: string;
      currency?: string;
    };
    if (offerData.provider_id !== providerId) return notFoundResponse("Offer not found");

    const status = offerData.status;
    if (status === "payment_pending") {
      return errorResponse(
        "This offer cannot be edited because the customer is currently processing payment.",
        "PAYMENT_IN_PROGRESS",
        409,
      );
    }
    const allowedStatuses = ["pending", "changes_requested"];
    if (!allowedStatuses.includes(status)) {
      return errorResponse(
        `This offer can no longer be edited. Current status: ${status}.`,
        "OFFER_NOT_EDITABLE",
        400,
        { currentStatus: status },
      );
    }

    if (parsed.staff_id) {
      const { data: staffRow } = await supabase
        .from("provider_staff")
        .select("id")
        .eq("id", parsed.staff_id)
        .eq("provider_id", providerId)
        .single();
      if (!staffRow) return errorResponse("Invalid staff", "VALIDATION_ERROR", 400);
    }
    if (parsed.location_id) {
      const { data: locRow } = await supabase
        .from("provider_locations")
        .select("id")
        .eq("id", parsed.location_id)
        .eq("provider_id", providerId)
        .single();
      if (!locRow) return errorResponse("Invalid location", "VALIDATION_ERROR", 400);
    }

    const expDate = new Date(parsed.expiration_at);
    if (Number.isNaN(expDate.getTime()) || expDate.getTime() <= Date.now()) {
      return errorResponse(
        "Offer expiration must be in the future so the customer has time to accept.",
        "INVALID_EXPIRATION",
        400,
      );
    }

    const now = new Date().toISOString();
    const scheduledIso = parsed.scheduled_at ? new Date(parsed.scheduled_at).toISOString() : null;
    const travelFeeAmount = parsed.travel_fee != null && parsed.travel_fee >= 0 ? Number(parsed.travel_fee) : 0;

    const { error: updateErr } = await supabaseAdmin
      .from("custom_offers")
      .update({
        price: parsed.price,
        currency: parsed.currency ?? offerData.currency,
        duration_minutes: parsed.duration_minutes,
        expiration_at: expDate.toISOString(),
        notes: parsed.notes ?? null,
        staff_id: parsed.staff_id ?? null,
        location_id: parsed.location_id ?? null,
        scheduled_at: scheduledIso,
        travel_fee: travelFeeAmount,
        status: "pending",
        change_request_note: null,
        changes_requested_at: null,
        updated_at: now,
      })
      .eq("id", offerId);

    if (updateErr) {
      return handleApiError(updateErr, "Failed to update offer");
    }

    await patchCustomOfferMessageAttachments(supabaseAdmin, offerId, {
      status: "pending",
      changeRequestNote: null,
      price: parsed.price,
      durationMinutes: parsed.duration_minutes,
      expirationAt: expDate.toISOString(),
    });

    if (offerData.request_id) {
      await supabaseAdmin
        .from("custom_requests")
        .update({ status: "offered", updated_at: now })
        .eq("id", offerData.request_id)
        .in("status", ["pending", "offered"]);
    }

    const { data: reqRow } = await supabaseAdmin
      .from("custom_requests")
      .select("customer_id")
      .eq("id", offerData.request_id ?? "")
      .maybeSingle();
    const customerId = (reqRow as { customer_id?: string } | null)?.customer_id;

    if (customerId) {
      try {
        let providerName = "The provider";
        const { data: pnRow } = await supabaseAdmin
          .from("providers")
          .select("business_name")
          .eq("id", providerId)
          .maybeSingle();
        const bn = (pnRow as { business_name?: string } | null)?.business_name;
        if (bn && bn.trim()) providerName = bn.trim();

        const template = await getNotificationTemplate("customer_custom_offer_updated");
        if (template?.enabled) {
          await sendTemplateNotification(
            "customer_custom_offer_updated",
            [customerId],
            {
              provider_name: providerName,
              offer_id: offerId,
              request_id: offerData.request_id ?? "",
            },
            template.channels || ["push", "email"],
            { appType: "customer" },
          );
        } else {
          await sendToUser(
            customerId,
            {
              title: "Offer updated",
              message: `${providerName} updated your custom offer.`,
              data: {
                type: "customer_custom_offer_updated",
                offer_id: offerId,
                request_id: offerData.request_id ?? "",
              },
              url: `/account-settings/custom-requests?request_id=${encodeURIComponent(offerData.request_id ?? "")}&offer_id=${encodeURIComponent(offerId)}`,
            },
            ["push", "email"],
            { appType: "customer" },
          );
        }
      } catch (notifyErr) {
        console.warn("[patch-offer] notify customer failed:", notifyErr);
      }
    }

    return successResponse({ updated: true, offer_id: offerId });
  } catch (error) {
    return handleApiError(error, "Failed to update offer");
  }
}
