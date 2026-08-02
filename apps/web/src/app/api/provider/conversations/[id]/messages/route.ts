import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { checkMessageLimit, formatLimitError } from "@/lib/subscriptions/limit-checker";
import { signMessageAttachmentsForResponse } from "@/lib/messaging/message-attachments";
import {
  enrichMessagesWithReplyTo,
  mapMessageWithReplyFields,
  validateReplyToMessageId,
} from "@/lib/messaging/message-replies";
import { insertNotification } from "@/lib/notifications/insert-notification";
import { z } from "zod";
import { assertNotBlocked, getBlockedUserIds, UserBlockedError } from "@/lib/safety/user-blocks";
import { requireSocialAccess } from "@/lib/safety/require-social-access";

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
    const permissionCheck = await requirePermission("view_messages", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const { id } = await params;
    const supabase = await getSupabaseServer(request);
    const supabaseAdmin = getSupabaseAdmin();
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const { data: conversation, error: convError } = await supabaseAdmin
      .from("conversations")
      .select("id, provider_id, customer_id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (convError || !conversation) {
      return notFoundResponse("Conversation not found");
    }

    await assertNotBlocked(user.id, conversation.customer_id as string, supabaseAdmin);

    const { data: messages, error } = await supabaseAdmin
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
        created_at,
        reply_to_message_id
      `)
      .eq("conversation_id", id)
      .eq("is_hidden", false)
      .order("created_at", { ascending: true });

    if (error) {
      throw error;
    }

    await supabaseAdmin
      .from("messages")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("conversation_id", id)
      .eq("is_read", false)
      .neq("sender_id", user.id);

    await supabaseAdmin
      .from("conversations")
      .update({ unread_count_provider: 0 })
      .eq("id", id);

    const senderIds = [...new Set((messages || []).map((m: any) => m.sender_id).filter(Boolean))];
    let senderMap: Record<string, any> = {};
    
    if (senderIds.length > 0) {
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

    const { data: providerRow } = await supabaseAdmin
      .from("providers")
      .select("business_name")
      .eq("id", providerId)
      .maybeSingle();
    const providerBusinessName =
      typeof providerRow?.business_name === "string" ? providerRow.business_name.trim() : null;

    const withReplies = await enrichMessagesWithReplyTo(supabaseAdmin, messages || [], {
      providerBusinessName,
    });

    const admin = getSupabaseAdmin();
    const transformed = await Promise.all(
      withReplies.map(async (msg: any) => {
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
      
      return mapMessageWithReplyFields(msg, {
        id: msg.id,
        conversation_id: msg.conversation_id,
        sender_id: msg.sender_id,
        sender_name: senderName,
        sender_avatar: sender?.avatar_url || null,
        content: msg.content,
        attachments: await signMessageAttachmentsForResponse(
          msg.attachments || [],
          admin,
          msg.created_at,
        ),
        is_read: msg.is_read,
        read_at: msg.read_at,
        sender_type: msg.sender_role === "customer" ? "customer" : "provider",
        created_at: msg.created_at,
      });
    }),
    );

    return successResponse(transformed);
  } catch (error) {
    if (error instanceof UserBlockedError || (error as { code?: string })?.code === "USER_BLOCKED") {
      return errorResponse("You cannot interact with this user.", "USER_BLOCKED", 403);
    }
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
  reply_to_message_id: z.string().uuid().optional(),
}).refine((data) => data.content || (data.attachments && data.attachments.length > 0), {
  message: "Either content or attachments must be provided",
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const permissionCheck = await requirePermission("send_messages", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    await requireSocialAccess(user.id, "direct_message", request);
    const { id } = await params;
    const supabase = await getSupabaseServer(request);
    const supabaseAdmin = getSupabaseAdmin();
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const { data: conversation, error: convError } = await supabaseAdmin
      .from("conversations")
      .select("id, provider_id, customer_id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (convError || !conversation) {
      return notFoundResponse("Conversation not found");
    }

    if (conversation.customer_id) {
      await assertNotBlocked(user.id, conversation.customer_id as string, supabaseAdmin);
    }

    // Check subscription message limit (but allow messaging even without subscription)
    // Messaging is a core feature and should work even without a subscription
    // Only enforce limits if there's an active subscription with explicit limits
    try {
      const messageLimitCheck = await checkMessageLimit(providerId, supabase);
      
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

    let replyToId: string | null = null;
    if (validated.reply_to_message_id) {
      const replyCheck = await validateReplyToMessageId(
        supabaseAdmin,
        id,
        validated.reply_to_message_id
      );
      if (replyCheck.ok === false) {
        return errorResponse(replyCheck.message, "VALIDATION_ERROR", 400);
      }
      replyToId = validated.reply_to_message_id;
    }

    const { data: message, error: messageError } = await supabaseAdmin
      .from("messages")
      .insert({
        conversation_id: id,
        sender_id: user.id,
        sender_role: user.role,
        content: validated.content || "",
        attachments: validated.attachments || [],
        reply_to_message_id: replyToId,
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
        const { data: convData } = await supabaseAdmin
          .from("conversations")
          .select("customer_id")
          .eq("id", id)
          .single();

      if (convData && convData.customer_id) {
        const customerId = convData.customer_id as string;
        const { filterBlockedNotificationRecipients } = await import("@/lib/safety/user-blocks");
        const notifyIds = await filterBlockedNotificationRecipients(
          user.id,
          [customerId],
          supabaseAdmin,
        );
        if (notifyIds.length > 0) {
          const notifyCustomerId = notifyIds[0]!;
          const messagePreview = validated.content
            ? (validated.content.length > 50 ? validated.content.slice(0, 50) + "..." : validated.content)
            : (validated.attachments && validated.attachments.length > 0 ? "Sent an attachment" : "New message");

          const { sendToUser, sendTemplateNotification, getNotificationTemplate } = await import(
            "@/lib/notifications/onesignal"
          );

          const template = await getNotificationTemplate("customer_new_message");

          if (template && template.enabled) {
            const { data: providerData } = await supabaseAdmin
              .from("providers")
              .select("business_name")
              .eq("id", providerId)
              .single();

            await sendTemplateNotification(
              "customer_new_message",
              [notifyCustomerId],
              {
                type: "new_message",
                provider_name: providerData?.business_name || "Your provider",
                message_preview: messagePreview,
                conversation_id: id,
              },
              template.channels || ["push"],
              { appType: "customer", skipInApp: true, senderUserId: user.id },
            );
          } else {
            await sendToUser(
              notifyCustomerId,
              {
                title: "New Message from Provider",
                message: messagePreview,
                data: { type: "new_message", conversation_id: id, message_id: message.id, url: `/account-settings/messages?conversation=${id}`, deep_link: `/account-settings/messages?conversation=${id}` },
                url: `/account-settings/messages?conversation=${id}`,
              },
              ["push"],
              { appType: "customer", senderUserId: user.id },
            );
          }

          await insertNotification({
            user_id: notifyCustomerId,
            type: "new_message",
            title: "New Message from Provider",
            message: messagePreview,
            data: { conversation_id: id, message_id: message.id },
            action_url: `/account-settings/messages?conversation=${id}`,
          });
        }
      }
    } catch (notifError) {
      // Don't fail message send if notification fails
      console.error("Failed to send message notification:", notifError);
    }

    void import("@/lib/subscriptions/subscription-limit-notifications")
      .then((m) => m.maybeNotifyProviderSubscriptionLimits(providerId))
      .catch((e) => console.warn("Subscription usage notification:", e));

    // Conversation unread counts + last message preview handled by DB trigger.

    return successResponse({
      id: message.id,
      conversation_id: id,
      sender_id: user.id,
      content: validated.content,
      reply_to_message_id: message.reply_to_message_id ?? null,
      is_read: false,
      sender_type: "provider",
      created_at: message.created_at,
    });
  } catch (error) {
    if (error instanceof UserBlockedError || (error as { code?: string })?.code === "USER_BLOCKED") {
      return errorResponse(
        error instanceof Error ? error.message : "You cannot interact with this user.",
        "USER_BLOCKED",
        403,
      );
    }
    if (error instanceof z.ZodError) {
      return handleApiError(error, "Invalid request data", 400);
    }
    return handleApiError(error, "Failed to send message");
  }
}
