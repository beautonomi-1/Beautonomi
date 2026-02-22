import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, handleApiError, notFoundResponse } from "@/lib/supabase/api-helpers";

const createOfferSchema = z.object({
  price: z.number().min(0),
  currency: z.string().min(3).max(5).default("ZAR"),
  duration_minutes: z.number().int().min(15).max(8 * 60),
  expiration_at: z.string(), // ISO
  notes: z.string().max(4000).optional().nullable(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const { id } = await params;
    const body = createOfferSchema.parse(await request.json());

    // Ensure request belongs to this provider
    const { data: reqRow } = await supabase
      .from("custom_requests")
      .select("id, customer_id, provider_id, status")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();
    if (!reqRow) return notFoundResponse("Custom request not found");

    const expIso = new Date(body.expiration_at).toISOString();

    const { data: offer, error } = await supabase
      .from("custom_offers")
      .insert({
        request_id: id,
        provider_id: providerId,
        price: body.price,
        currency: body.currency,
        duration_minutes: body.duration_minutes,
        expiration_at: expIso,
        notes: body.notes ?? null,
        status: "pending",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw error;

    // Mark request as offered
    await supabase
      .from("custom_requests")
      .update({ status: "offered", updated_at: new Date().toISOString() })
      .eq("id", id);

    // Also send via messages: post an offer message in the customer<->provider conversation (best-effort)
    try {
      const customerId = (reqRow as any).customer_id as string;
      const { data: existingConv } = await supabase
        .from("conversations")
        .select("id")
        .eq("customer_id", customerId)
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
            customer_id: customerId,
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
        const messageContent = `Custom offer: ${body.currency} ${body.price} • ${body.duration_minutes} mins`;
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
                request_id: id,
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
      // ignore
    }

    // Notify customer using template (best-effort)
    try {
      const { sendTemplateNotification, getNotificationTemplate } = await import("@/lib/notifications/onesignal");
      const template = await getNotificationTemplate("customer_custom_offer");
      
      if (template && template.enabled) {
        await sendTemplateNotification(
          "customer_custom_offer",
          [(reqRow as any).customer_id],
          {
            provider_name: (reqRow as any)?.providers?.business_name || "A provider",
            price: body.price.toString(),
            currency: body.currency,
            request_id: id,
            offer_id: (offer as any).id,
          },
          template.channels || ["push", "email"]
        );
      } else {
        console.warn("Notification template 'customer_custom_offer' not found, skipping notification");
      }
    } catch {
      // ignore notification errors
    }

    return successResponse(offer);
  } catch (error) {
    return handleApiError(error, "Failed to create custom offer");
  }
}

