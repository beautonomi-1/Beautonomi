import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getProviderIdForUser,
  successResponse,
  handleApiError,
  notFoundResponse,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { isFeatureEnabledServer } from "@/lib/server/feature-flags";
import { FEATURE_FLAG_KEYS } from "@/lib/server/feature-flag-keys";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { addDays } from "date-fns";
import { dateRangeBoundsUtc, formatDateYmd, nowInTz, resolveTz } from "@/lib/dates/provider-tz";
import {
  checkNewGateFeatureAccess,
  SUBSCRIPTION_FEATURE_KEYS,
} from "@/lib/subscriptions/feature-access";
import {
  resolveCustomerProviderConversation,
  updateConversationAfterMessage,
} from "@/lib/chat/resolve-conversation";
import { insertNotifications } from "@/lib/notifications/insert-notification";

const createCustomOfferSchema = z.object({
  customer_id: z.string().uuid(),
  conversation_id: z.string().uuid().optional().nullable(), // if provided, post message to this thread
  service_category_id: z.string().uuid().nullable().optional(),
  service_name: z.string().min(1).max(256).optional().nullable(),
  location_type: z.enum(["at_home", "at_salon"]).default("at_salon"),
  description: z.string().min(5).max(4000),
  price: z.number().min(0),
  currency: z.string().min(3).max(5).optional(),
  duration_minutes: z.number().int().min(15).max(8 * 60),
  expiration_at: z.string(), // ISO
  notes: z.string().max(4000).optional().nullable(),
  preferred_start_at: z.string().nullable().optional(),
  scheduled_at: z.string().nullable().optional(),
  image_urls: z.array(z.string().url()).max(6).optional().default([]),
  staff_id: z.string().uuid().optional().nullable(),
  location_id: z.string().uuid().optional().nullable(), // For at_salon: venue for the booking
  // For at_home: address used when creating booking after customer accepts
  address_line1: z.string().max(500).optional().nullable(),
  address_line2: z.string().max(500).optional().nullable(),
  address_city: z.string().max(200).optional().nullable(),
  address_state: z.string().max(200).optional().nullable(),
  address_country: z.string().max(100).optional().nullable(),
  address_postal_code: z.string().max(20).optional().nullable(),
  travel_fee: z.number().min(0).optional().nullable(),
});

/**
 * POST /api/provider/custom-offers/create
 * Create a custom request and offer in one go (provider-initiated).
 * Supports: service_name, service_category_id, location_type (at_salon/at_home), address for at_home,
 * travel_fee for at_home, description, price, duration, expiration, notes, preferred_start_at, staff_id, image_urls.
 * When accepted and paid, a single booking is created with one booking_service (the custom offering).
 * Variants/addons/packages/products: currently one service per offer; addons can be added to the booking
 * after creation by the provider, or supported in a future iteration with a line-items payload.
 */
export async function POST(request: NextRequest) {
  try {
    const permissionCheck = await requirePermission("send_messages", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const { data: prow } = await supabase
      .from("providers")
      .select("tenant_id, timezone")
      .eq("id", providerId)
      .maybeSingle();
    const effectiveTenantId =
      (prow as { tenant_id?: string | null } | null)?.tenant_id ??
      (await resolveTenantIdWithZaFallback(request));
    const lastResortCurrency =
      (await getTenantRegionConfig(effectiveTenantId))?.defaultCurrency ?? LAST_RESORT_CURRENCY;

    if (!(await isFeatureEnabledServer(FEATURE_FLAG_KEYS.PROVIDER_CUSTOM_OFFERS, effectiveTenantId))) {
      return errorResponse(
        "Custom offers are disabled for this market or your workspace. If this is unexpected, contact support — you can enable them from admin feature flags (commerce.provider_custom_offers).",
        "CUSTOM_OFFERS_DISABLED",
        403,
      );
    }

    const customRequestsOk = await checkNewGateFeatureAccess(
      providerId,
      SUBSCRIPTION_FEATURE_KEYS.customRequests,
      supabase,
    );
    if (!customRequestsOk) {
      return errorResponse(
        "Custom requests and offers are not included in your current subscription plan. Upgrade to use this feature.",
        "SUBSCRIPTION_FEATURE_DISABLED",
        403,
      );
    }

    const parsed = createCustomOfferSchema.parse(await request.json());
    const body = { ...parsed, currency: parsed.currency ?? lastResortCurrency };

    if (body.location_type === "at_home" && !body.address_line1?.trim()) {
      return errorResponse(
        "House-call custom offers require a service address (address_line1).",
        "VALIDATION_ERROR",
        400,
      );
    }
    if (body.location_type === "at_salon" && !body.location_id) {
      return errorResponse(
        "At-salon custom offers require a salon location.",
        "VALIDATION_ERROR",
        400,
      );
    }

    // Verify customer exists (admin client bypasses RLS so provider can resolve customer_id)
    const supabaseAdmin = getSupabaseAdmin();
    const { data: customer } = await supabaseAdmin
      .from("users")
      .select("id, full_name, email")
      .eq("id", body.customer_id)
      .single();

    if (!customer) {
      return handleApiError(new Error("Customer not found"), "Customer not found", 404);
    }

    const requestedStart = body.preferred_start_at ?? body.scheduled_at ?? null;
    const preferredIso = requestedStart ? new Date(requestedStart).toISOString() : null;
    const offerTz = resolveTz((prow as { timezone?: string | null } | null)?.timezone);
    const limitYmd = formatDateYmd(addDays(nowInTz(offerTz), 7), offerTz);
    const { toIso: requestExpiresIso } = dateRangeBoundsUtc(limitYmd, limitYmd, offerTz);

    // Verify staff_id belongs to this provider (if provided)
    if (body.staff_id) {
      const { data: staffRow } = await supabase
        .from("provider_staff")
        .select("id, provider_id")
        .eq("id", body.staff_id)
        .eq("provider_id", providerId)
        .single();
      
      if (!staffRow) {
        return handleApiError(new Error("Staff member not found or does not belong to this provider"), "Invalid staff assignment", 400);
      }
    }

    // Verify location_id belongs to this provider (if provided, for at_salon)
    if (body.location_id) {
      const { data: locRow } = await supabase
        .from("provider_locations")
        .select("id")
        .eq("id", body.location_id)
        .eq("provider_id", providerId)
        .single();
      if (!locRow) {
        return handleApiError(new Error("Location not found or does not belong to this provider"), "Invalid location", 400);
      }
    }

    // Create custom request (provider-initiated)
    const { data: createdRequest, error: createRequestError } = await supabase
      .from("custom_requests")
      .insert({
        customer_id: body.customer_id,
        provider_id: providerId,
        service_category_id: body.service_category_id ?? null,
        service_name: body.service_name ?? null,
        location_type: body.location_type,
        description: body.description,
        budget_min: null,
        budget_max: null,
        preferred_start_at: preferredIso,
        duration_minutes: body.duration_minutes,
        status: "offered",
        expires_at: requestExpiresIso,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        address_line1: body.address_line1 ?? null,
        address_line2: body.address_line2 ?? null,
        address_city: body.address_city ?? null,
        address_state: body.address_state ?? null,
        address_country: body.address_country ?? null,
        address_postal_code: body.address_postal_code ?? null,
      })
      .select()
      .single();
    
    if (createRequestError) throw createRequestError;

    // Add attachments if any
    if (body.image_urls.length > 0) {
      const attachments = body.image_urls.map((url) => ({
        request_id: (createdRequest as any).id,
        url,
        created_at: new Date().toISOString(),
      }));
      const { error: attachmentsError } = await supabase
        .from("custom_request_attachments")
        .insert(attachments);
      if (attachmentsError) {
        console.error("Failed to insert attachments:", attachmentsError);
        // Continue even if attachments fail
      }
    }

    const travelFeeAmount = body.location_type === "at_home" && body.travel_fee != null && body.travel_fee >= 0
      ? Number(body.travel_fee)
      : 0;

    // Create the offer immediately
    const expIso = new Date(body.expiration_at).toISOString();
    const { data: offer, error: createOfferError } = await supabase
      .from("custom_offers")
      .insert({
        request_id: (createdRequest as any).id,
        provider_id: providerId,
        price: body.price,
        currency: body.currency,
        duration_minutes: body.duration_minutes,
        expiration_at: expIso,
        notes: body.notes ?? null,
        staff_id: body.staff_id || null,
        location_id: body.location_id ?? null,
        scheduled_at: preferredIso,
        travel_fee: travelFeeAmount,
        status: "pending",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();
    
    if (createOfferError) throw createOfferError;

    // Send via messages: use conversation_id if provided (same thread), else resolve the pair thread.
    let conversationIdForNotify: string | null = body.conversation_id ?? null;
    try {
      let convId: string | null = null;

      if (body.conversation_id) {
        const { data: conv } = await supabaseAdmin
          .from("conversations")
          .select("id")
          .eq("id", body.conversation_id)
          .eq("customer_id", body.customer_id)
          .eq("provider_id", providerId)
          .single();
        convId = (conv as { id?: string } | null)?.id ?? null;
      }

      if (!convId) {
        const resolved = await resolveCustomerProviderConversation(supabaseAdmin, {
          customerId: body.customer_id,
          providerId,
          lastMessageSenderId: user.id,
        });
        convId = resolved.id;
      }
      conversationIdForNotify = convId;

      const preview = body.description.length > 200 ? body.description.slice(0, 200) + "…" : body.description;
      const messageContent = `Custom offer: ${body.currency} ${body.price} • ${body.duration_minutes} mins\n\n${preview}`;
      const requestId = (createdRequest as { id: string }).id;
      const offerId = (offer as { id: string }).id;
      const { error: messageError } = await supabaseAdmin.from("messages").insert({
        conversation_id: convId,
        sender_id: user.id,
        sender_role: user.role,
        content: messageContent,
        attachments: [
          {
            type: "custom_offer",
            status: "pending",
            request_id: requestId,
            offer_id: offerId,
            price: body.price,
            currency: body.currency,
            duration_minutes: body.duration_minutes,
            expiration_at: expIso,
            preferred_start_at: preferredIso ?? null,
          },
        ],
        is_read: false,
        created_at: new Date().toISOString(),
      });

      if (messageError) {
        console.error("[provider/custom-offers/create] Failed to insert message:", messageError);
      } else {
        await updateConversationAfterMessage(supabaseAdmin, convId, user.id, messageContent);
      }
    } catch (err) {
      console.error("[provider/custom-offers/create] failed to post message to conversation:", err);
    }

    // Notify customer (best-effort)
    try {
      const { sendTemplateNotification } = await import("@/lib/notifications/onesignal");
      const { data: providerRow } = await supabase
        .from("providers")
        .select("business_name")
        .eq("id", providerId)
        .single();
      const providerName = providerRow?.business_name || "A provider";
      const requestId = (createdRequest as { id: string }).id;
      const offerId = (offer as { id: string }).id;
      const checkoutUrl = `/account-settings/custom-requests?request_id=${requestId}&offer=${encodeURIComponent(offerId)}`;

      await sendTemplateNotification(
        "customer_custom_offer",
        [body.customer_id],
        {
          provider_name: providerName,
          price: body.price.toString(),
          currency: body.currency,
          request_id: requestId,
          offer_id: offerId,
        },
        ["push", "email"],
        { appType: "customer" },
      );

      await insertNotifications([
        {
          user_id: body.customer_id,
          type: "custom_offer",
          title: "Custom Offer Received",
          message: `${providerName} sent you a custom service offer. Review and accept to proceed.`,
          data: {
            request_id: requestId,
            offer_id: offerId,
            conversation_id: conversationIdForNotify,
          },
          action_url: checkoutUrl,
        },
      ]);
    } catch (notifyErr) {
      console.error("[provider/custom-offers/create] notification failed:", notifyErr);
    }

    return successResponse({
      request: createdRequest,
      offer: offer,
    });
  } catch (error) {
    return handleApiError(error, "Failed to create custom offer");
  }
}
