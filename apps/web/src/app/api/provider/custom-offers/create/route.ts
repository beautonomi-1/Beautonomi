import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, handleApiError, notFoundResponse } from "@/lib/supabase/api-helpers";

const createCustomOfferSchema = z.object({
  customer_id: z.string().uuid(),
  service_category_id: z.string().uuid().nullable().optional(),
  location_type: z.enum(["at_home", "at_salon"]).default("at_salon"),
  description: z.string().min(10).max(4000),
  price: z.number().min(0),
  currency: z.string().min(3).max(5).default("ZAR"),
  duration_minutes: z.number().int().min(15).max(8 * 60),
  expiration_at: z.string(), // ISO
  notes: z.string().max(4000).optional().nullable(),
  preferred_start_at: z.string().nullable().optional(),
  image_urls: z.array(z.string().url()).max(6).optional().default([]),
  staff_id: z.string().uuid().optional().nullable(), // Staff member to assign to the booking
});

/**
 * POST /api/provider/custom-offers/create
 * Create a custom request and offer in one go (provider-initiated)
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const body = createCustomOfferSchema.parse(await request.json());

    // Verify customer exists
    const { data: customer } = await supabase
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

    // Create custom request (provider-initiated)
    const { data: createdRequest, error: createRequestError } = await supabase
      .from("custom_requests")
      .insert({
        customer_id: body.customer_id,
        provider_id: providerId,
        service_category_id: body.service_category_id ?? null,
        location_type: body.location_type,
        description: body.description,
        budget_min: null,
        budget_max: null,
        preferred_start_at: preferredIso,
        duration_minutes: body.duration_minutes,
        status: "offered", // Mark as offered immediately since we're creating an offer
        expires_at: expiresAt.toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
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
        staff_id: body.staff_id || null, // Store assigned staff for calendar/appointment compatibility
        status: "pending",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();
    
    if (createOfferError) throw createOfferError;

    // Send via messages: create/get conversation and post a message (best-effort)
    try {
      const { data: existingConv } = await supabase
        .from("conversations")
        .select("id")
        .eq("customer_id", body.customer_id)
        .eq("provider_id", providerId)
        .is("booking_id", null)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      let convId = (existingConv as any)?.id;
      
      if (!convId) {
        const { data: newConv, error: convError } = await supabase
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
        const { error: messageError } = await supabase
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
              },
            ],
            is_read: false,
            created_at: new Date().toISOString(),
          });
        
        if (!messageError) {
          // Update conversation metadata
          const { data: currentConv } = await supabase
            .from("conversations")
            .select("unread_count_customer")
            .eq("id", convId)
            .single();
          
          await supabase
            .from("conversations")
            .update({
              last_message_at: new Date().toISOString(),
              last_message_preview: messageContent,
              last_message_sender_id: user.id,
              unread_count_customer: ((currentConv as any)?.unread_count_customer || 0) + 1,
              updated_at: new Date().toISOString(),
            })
            .eq("id", convId);
        }
      }
    } catch {
      // ignore messaging failures
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
