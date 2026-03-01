import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";

const createSchema = z.object({
  provider_id: z.string().uuid(),
  service_category_id: z.string().uuid().nullable().optional(),
  location_type: z.enum(["at_home", "at_salon"]).default("at_salon"),
  description: z.string().min(10).max(4000),
  budget_min: z.number().min(0).nullable().optional(),
  budget_max: z.number().min(0).nullable().optional(),
  preferred_start_at: z.string().nullable().optional(),
  duration_minutes: z.number().int().min(15).max(8 * 60).default(60),
  image_urls: z.array(z.string().url()).max(6).optional().default([]),
}).refine((data) => {
  // Ensure budget_max >= budget_min if both are provided (matches database constraint)
  if (data.budget_min != null && data.budget_max != null) {
    return data.budget_max >= data.budget_min;
  }
  return true;
}, {
  message: "Maximum budget must be greater than or equal to minimum budget",
  path: ["budget_max"],
});

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["customer", "superadmin"], request);
    const supabase = await getSupabaseServer();

    const { data, error } = await supabase
      .from("custom_requests")
      .select(
        `
        *,
        provider:providers(id, business_name, slug, user_id),
        attachments:custom_request_attachments(id, url, created_at),
        offers:custom_offers(id, price, currency, duration_minutes, expiration_at, notes, status, payment_url, payment_reference, paid_at, created_at, staff_id, location_id, scheduled_at, staff:provider_staff(id, name), location:provider_locations(id, name))
      `
      )
      .eq("customer_id", user.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return successResponse(data || []);
  } catch (error) {
    return handleApiError(error, "Failed to fetch custom requests");
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["customer", "superadmin"], request);
    const supabase = await getSupabaseServer();

    const body = createSchema.parse(await request.json());

    const preferredIso = body.preferred_start_at ? new Date(body.preferred_start_at).toISOString() : null;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const { data: created, error: createError } = await supabase
      .from("custom_requests")
      .insert({
        customer_id: user.id,
        provider_id: body.provider_id,
        service_category_id: body.service_category_id ?? null,
        location_type: body.location_type,
        description: body.description,
        budget_min: body.budget_min ?? null,
        budget_max: body.budget_max ?? null,
        preferred_start_at: preferredIso,
        duration_minutes: body.duration_minutes,
        status: "pending",
        expires_at: expiresAt.toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (createError) throw createError;

    if (body.image_urls.length > 0) {
      const attachments = body.image_urls.map((url) => ({
        request_id: (created as any).id,
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

    // Also send via messages: create/get a customer<->provider conversation and post a message (best-effort)
    try {
      const { data: existingConv } = await supabase
        .from("conversations")
        .select("id")
        .eq("customer_id", user.id)
        .eq("provider_id", body.provider_id)
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
            customer_id: user.id,
            provider_id: body.provider_id,
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
        const messageContent = `Custom request: ${preview}`;
        const { error: messageError } = await supabase
          .from("messages")
          .insert({
            conversation_id: convId,
            sender_id: user.id,
            sender_role: "customer",
            content: messageContent,
            attachments: [
              {
                type: "custom_request",
                request_id: (created as any).id,
                provider_id: body.provider_id,
              },
            ],
            is_read: false,
            created_at: new Date().toISOString(),
          });
        if (messageError) {
          console.error("Failed to insert message:", messageError);
          // Continue even if message fails
        } else {
          // Update conversation metadata
          const { data: currentConv } = await supabase
            .from("conversations")
            .select("unread_count_provider")
            .eq("id", convId)
            .single();
          
          await supabase
            .from("conversations")
            .update({
              last_message_at: new Date().toISOString(),
              last_message_preview: messageContent,
              last_message_sender_id: user.id,
              unread_count_provider: ((currentConv as any)?.unread_count_provider || 0) + 1,
              updated_at: new Date().toISOString(),
            })
            .eq("id", convId);
        }
      }
    } catch {
      // ignore messaging failures
    }

    // Notify provider owner (best-effort)
    try {
      const { data: providerRow } = await supabase
        .from("providers")
        .select("user_id, business_name")
        .eq("id", body.provider_id)
        .single();
      const providerUserId = (providerRow as any)?.user_id;
      if (providerUserId) {
        // Send push notification (try template first, fallback to hardcoded)
        try {
          const { sendToUser, sendTemplateNotification, getNotificationTemplate } = await import("@/lib/notifications/onesignal");
          
          // Try to use notification template
          const template = await getNotificationTemplate("provider_custom_request");
          
          if (template && template.enabled) {
            // Use template with variables
            await sendTemplateNotification(
              "provider_custom_request",
              [providerUserId],
              {
                customer_name: user.full_name || user.email || "A customer",
                description_preview: body.description.slice(0, 50) + "...",
                request_id: (created as any).id,
                provider_id: body.provider_id,
              },
              template.channels || ["push"]
            );
          } else {
            // Fallback to direct notification
            await sendToUser(providerUserId, {
              title: "New Custom Request",
              message: `A customer sent you a custom service request: ${body.description.slice(0, 50)}...`,
              data: { type: "custom_request", request_id: (created as any).id, provider_id: body.provider_id },
              url: `/provider/custom-requests?request_id=${(created as any).id}`,
            });
          }
        } catch (notifError) {
          console.error("Failed to send push notification:", notifError);
        }

        // Also create an in-app notification record (if notifications table exists)
        try {
          const { data: notificationExists } = await supabase
            .from("notifications")
            .select("id")
            .limit(1)
            .maybeSingle();
          
          if (notificationExists !== null) {
            // Use template content if available, otherwise use fallback
            let notificationTitle = "New Custom Request";
            let notificationMessage = `A customer sent you a custom service request.`;
            
            // Get template again for in-app notification
            const { getNotificationTemplate: getNotificationTemplate2 } = await import("@/lib/notifications/onesignal");
            const inAppTemplate = await getNotificationTemplate2("provider_custom_request");
            
            if (inAppTemplate && inAppTemplate.enabled) {
              // Replace template variables for in-app notification
              notificationTitle = inAppTemplate.title
                .replace(/\{\{customer_name\}\}/g, user.full_name || user.email || "A customer")
                .replace(/\{\{description_preview\}\}/g, body.description.slice(0, 50) + "...");
              notificationMessage = inAppTemplate.body
                .replace(/\{\{customer_name\}\}/g, user.full_name || user.email || "A customer")
                .replace(/\{\{description_preview\}\}/g, body.description.slice(0, 50) + "...");
            }
            
            // Notifications table exists, create a record
            await supabase
              .from("notifications")
              .insert({
                user_id: providerUserId,
                type: "custom_request",
                title: notificationTitle,
                message: notificationMessage,
                data: { request_id: (created as any).id, provider_id: body.provider_id },
                is_read: false,
                created_at: new Date().toISOString(),
              });
          }
        } catch (notifError) {
          // Notifications table might not exist, ignore
          console.debug("Notifications table not available:", notifError);
        }
      }
    } catch (error) {
      console.error("Failed to notify provider:", error);
      // Continue even if notification fails
    }

    return successResponse(created);
  } catch (error) {
    return handleApiError(error, "Failed to create custom request");
  }
}

