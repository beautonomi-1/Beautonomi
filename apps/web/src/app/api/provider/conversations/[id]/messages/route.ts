import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { checkMessageLimit, formatLimitError } from "@/lib/subscriptions/limit-checker";
import { z } from "zod";

/**
 * GET /api/provider/conversations/[id]/messages
 * 
 * Get messages for a conversation
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Check permission to view messages
    const permissionCheck = await requirePermission("view_messages", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const { id } = await params;
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("id, provider_id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (convError || !conversation) {
      return notFoundResponse("Conversation not found");
    }

    // Get messages
    const { data: messages, error } = await supabase
      .from("messages")
      .select(`
        id,
        conversation_id,
        sender_id,
        sender_role,
        content,
        attachments,
        is_read,
        read_at,
        created_at
      `)
      .eq("conversation_id", id)
      .order("created_at", { ascending: true });

    if (error) {
      throw error;
    }

    // Mark messages as read
    await supabase
      .from("messages")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("conversation_id", id)
      .eq("is_read", false)
      .neq("sender_id", user.id);

    // Update conversation unread count (provider side)
    await supabase
      .from("conversations")
      .update({ unread_count_provider: 0 })
      .eq("id", id);

    // Fetch sender data using admin client to bypass RLS
    const senderIds = [...new Set((messages || []).map((m: any) => m.sender_id).filter(Boolean))];
    let senderMap: Record<string, any> = {};
    
    if (senderIds.length > 0) {
      const supabaseAdmin = await getSupabaseAdmin();
      const { data: senders } = await supabaseAdmin
        .from("users")
        .select("id, full_name, email, avatar_url")
        .in("id", senderIds);
      
      if (senders && senders.length > 0) {
        senderMap = senders.reduce((acc: Record<string, any>, sender: any) => {
          acc[sender.id] = sender;
          return acc;
        }, {});
      }
    }

    const transformed = (messages || []).map((msg: any) => {
      const sender = senderMap[msg.sender_id];
      
      // Determine sender name - prioritize full_name, then email, then fallback
      let senderName = "Unknown";
      if (sender) {
        if (sender.full_name && sender.full_name.trim()) {
          senderName = sender.full_name.trim();
        } else if (sender.email) {
          senderName = sender.email;
        }
      }
      
      return {
        id: msg.id,
        conversation_id: msg.conversation_id,
        sender_id: msg.sender_id,
        sender_name: senderName,
        sender_avatar: sender?.avatar_url || null,
        content: msg.content,
        attachments: msg.attachments || [],
        is_read: msg.is_read,
        read_at: msg.read_at, // Include read_at for read receipts
        sender_type: msg.sender_role === "customer" ? "customer" : "provider",
        created_at: msg.created_at,
      };
    });

    return successResponse(transformed);
  } catch (error) {
    return handleApiError(error, "Failed to fetch messages");
  }
}

/**
 * POST /api/provider/conversations/[id]/messages
 * 
 * Send a message in a conversation
 */
const sendMessageSchema = z.object({
  content: z.string().optional(),
  attachments: z.array(z.object({
    url: z.string(),
    type: z.string(),
    name: z.string().optional(),
    size: z.number().optional(),
  })).optional(),
}).refine((data) => data.content || (data.attachments && data.attachments.length > 0), {
  message: "Either content or attachments must be provided",
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Check permission to send messages
    const permissionCheck = await requirePermission("send_messages", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const { id } = await params;
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("id, provider_id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (convError || !conversation) {
      return notFoundResponse("Conversation not found");
    }

    // Check subscription message limit (but allow messaging even without subscription)
    // Messaging is a core feature and should work even without a subscription
    // Only enforce limits if there's an active subscription with explicit limits
    try {
      const messageLimitCheck = await checkMessageLimit(providerId);
      
      // Only block if:
      // 1. There's an actual limit (limitValue is not null)
      // 2. The limit has been exceeded (currentCount >= limitValue)
      // 3. The plan name is not empty (meaning there's an active subscription)
      if (!messageLimitCheck.canProceed && 
          messageLimitCheck.limitValue !== null && 
          messageLimitCheck.planName && 
          messageLimitCheck.planName.trim() !== "" &&
          messageLimitCheck.currentCount >= messageLimitCheck.limitValue) {
        // Only block if there's an active subscription with a limit that's been exceeded
        return errorResponse(
          formatLimitError(messageLimitCheck),
          "SUBSCRIPTION_LIMIT_EXCEEDED",
          403
        );
      }
      // Allow messaging if:
      // - No subscription (planName is empty)
      // - Limit is null (unlimited)
      // - Limit hasn't been exceeded yet
    } catch (limitError) {
      // If limit check fails, allow messaging anyway (don't block core functionality)
      console.warn("Message limit check failed, allowing message:", limitError);
    }

    const body = await request.json();
    const validated = sendMessageSchema.parse(body);

    // Create message
    const { data: message, error: messageError } = await supabase
      .from("messages")
      .insert({
        conversation_id: id,
        sender_id: user.id,
        sender_role: user.role,
        content: validated.content || "",
        attachments: validated.attachments || [],
        is_read: false,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (messageError) {
      throw messageError;
    }

    // Send notification to customer (best-effort)
    try {
      const { data: convData } = await supabase
        .from("conversations")
        .select("customer_id")
        .eq("id", id)
        .single();

      if (convData && convData.customer_id) {
        const customerId = convData.customer_id;
        const messagePreview = validated.content 
          ? (validated.content.length > 50 ? validated.content.slice(0, 50) + "..." : validated.content)
          : (validated.attachments && validated.attachments.length > 0 ? "Sent an attachment" : "New message");

        // Send OneSignal push notification (try template first, fallback to hardcoded)
        const { sendToUser: _sendToUser, sendTemplateNotification, getNotificationTemplate } = await import("@/lib/notifications/onesignal");
        
        // Try to use notification template
        const template = await getNotificationTemplate("customer_new_message");
        
        if (template && template.enabled) {
          // Get provider name for template
          const { data: providerData } = await supabase
            .from("providers")
            .select("business_name")
            .eq("id", providerId)
            .single();
          
          // Use template with variables
          await sendTemplateNotification(
            "customer_new_message",
            [customerId],
            {
              provider_name: providerData?.business_name || "Your provider",
              message_preview: messagePreview,
              conversation_id: id,
            },
            template.channels || ["push"]
          );
        } else {
          // Fallback: Try to use template, but if template doesn't exist, log warning
          console.warn("Notification template 'new_message' not found, skipping notification");
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
                user_id: customerId,
                type: "new_message",
                title: "New Message from Provider",
                message: messagePreview,
                data: { conversation_id: id, message_id: message.id },
                is_read: false,
                created_at: new Date().toISOString(),
              });
          }
        } catch (notifError) {
          console.debug("Failed to create notification record:", notifError);
        }
      }
    } catch (notifError) {
      // Don't fail message send if notification fails
      console.error("Failed to send message notification:", notifError);
    }

    // Conversation unread counts + last message preview handled by DB trigger.

    return successResponse({
      id: message.id,
      conversation_id: id,
      sender_id: user.id,
      content: validated.content,
      is_read: false,
      sender_type: "provider",
      created_at: message.created_at,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(error, "Invalid request data", 400);
    }
    return handleApiError(error, "Failed to send message");
  }
}
