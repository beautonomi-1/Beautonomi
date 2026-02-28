import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, getProviderIdForUser, successResponse, handleApiError, notFoundResponse } from "@/lib/supabase/api-helpers";

const createCustomOfferSchema = z.object({
  customer_id: z.string().uuid(),
  conversation_id: z.string().uuid().optional().nullable(), // if provided, post message to this thread
  service_category_id: z.string().uuid().nullable().optional(),
  service_name: z.string().min(1).max(256).optional().nullable(),
  location_type: z.enum(["at_home", "at_salon"]).default("at_salon"),
  description: z.string().min(10).max(4000),
  price: z.number().min(0),
  currency: z.string().min(3).max(5).default("ZAR"),
  duration_minutes: z.number().int().min(15).max(8 * 60),
  expiration_at: z.string(), // ISO
  notes: z.string().max(4000).optional().nullable(),
  preferred_start_at: z.string().nullable().optional(),
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
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const body = createCustomOfferSchema.parse(await request.json());

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

    const preferredIso = body.preferred_start_at ? new Date(body.preferred_start_at).toISOString() : null;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

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
        expires_at: expiresAt.toISOString(),
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

    // Send via messages: use conversation_id if provided (same thread), else find or create general conversation.
    // Use admin client so RLS cannot block the insert; include preferred_start_at so the card can show date/time.
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
        convId = (conv as any)?.id ?? null;
      }

      if (!convId) {
        const { data: existingConv } = await supabaseAdmin
          .from("conversations")
          .select("id")
          .eq("customer_id", body.customer_id)
          .eq("provider_id", providerId)
          .is("booking_id", null)
          .order("last_message_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        convId = (existingConv as any)?.id ?? null;
      }

      if (!convId) {
        const { data: newConv, error: convError } = await supabaseAdmin
          .from("conversations")
          .insert({
            booking_id: null,
            customer_id: body.customer_id,
            provider_id: providerId,
            last_message_at: new Date().toISOString(),
            last_message_preview: "",
            last_message_sender_id: user.id,
            unread_count_customer: 0,
            unread_count_provider: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .select("id")
          .single();

        if (!convError && newConv) {
          convId = (newConv as any)?.id;
        }
      }

      if (convId) {
        const preview = body.description.length > 200 ? body.description.slice(0, 200) + "…" : body.description;
        const messageContent = `Custom offer: ${body.currency} ${body.price} • ${body.duration_minutes} mins\n\n${preview}`;
        const { error: messageError } = await supabaseAdmin
          .from("messages")
          .insert({
            conversation_id: convId,
            sender_id: user.id,
            sender_role: user.role,
            content: messageContent,
            attachments: [
              {
                type: "custom_offer",
                request_id: (createdRequest as any).id,
                offer_id: (offer as any).id,
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

        if (!messageError) {
          const { data: currentConv } = await supabaseAdmin
            .from("conversations")
            .select("unread_count_customer")
            .eq("id", convId)
            .single();

          await supabaseAdmin
            .from("conversations")
            .update({
              last_message_at: new Date().toISOString(),
              last_message_preview: messageContent,
              last_message_sender_id: user.id,
              unread_count_customer: ((currentConv as any)?.unread_count_customer ?? 0) + 1,
              updated_at: new Date().toISOString(),
            })
            .eq("id", convId);
        }
      }
    } catch (err) {
      console.warn("Custom offer: failed to post message to conversation", err);
    }

    // Notify customer (best-effort)
    try {
      const { sendToUser: _sendToUser, sendTemplateNotification, getNotificationTemplate } = await import("@/lib/notifications/onesignal");
      
      // Try to use notification template
      const template = await getNotificationTemplate("customer_custom_offer");
      
      if (template && template.enabled) {
        // Use template with variables
        await sendTemplateNotification(
          "customer_custom_offer",
          [body.customer_id],
          {
            provider_name: (await supabase.from("providers").select("business_name").eq("id", providerId).single()).data?.business_name || "A provider",
            price: body.price.toString(),
            currency: body.currency,
            request_id: (createdRequest as any).id,
            offer_id: (offer as any).id,
          },
          template.channels || ["push"]
        );
      } else {
        // Fallback: Log warning if template doesn't exist
        console.warn("Notification template 'customer_custom_offer' not found, skipping notification");
      }

      // Create in-app notification record
      try {
        const { data: notificationExists } = await supabase
          .from("notifications")
          .select("id")
          .limit(1)
          .maybeSingle();
        
        if (notificationExists !== null) {
          await supabase
            .from("notifications")
            .insert({
              user_id: body.customer_id,
              type: "custom_offer",
              title: "Custom Offer Received",
              message: "A provider sent you a custom service offer. Review and accept to proceed.",
              data: { request_id: (createdRequest as any).id, offer_id: (offer as any).id },
              is_read: false,
              created_at: new Date().toISOString(),
            });
        }
      } catch (notifError) {
        console.debug("Failed to create notification record:", notifError);
      }
    } catch {
      // ignore
    }

    return successResponse({
      request: createdRequest,
      offer: offer,
    });
  } catch (error) {
    return handleApiError(error, "Failed to create custom offer");
  }
}
