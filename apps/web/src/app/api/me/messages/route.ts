import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { sanitizeMessageAttachmentsForResponse } from "@/lib/messaging/message-attachments";
import {
  enrichMessagesWithReplyTo,
  isProviderMessageRole,
  mapMessageWithReplyFields,
  validateReplyToMessageId,
} from "@/lib/messaging/message-replies";

/**
 * Verify the caller has access to a conversation. Returns the role ("customer" | "provider").
 * Throws if access is denied.
 */
async function verifyConversationAccess(
  supabase: Awaited<ReturnType<typeof getSupabaseServer>>,
  conversationId: string,
  userId: string
): Promise<{ conv: any; role: "customer" | "provider" }> {
  const { data: conv } = await supabase
    .from("conversations")
    .select("id, customer_id, provider_id, provider:providers(business_name)")
    .eq("id", conversationId)
    .single();

  if (!conv) throw Object.assign(new Error("Conversation not found"), { status: 404 });

  if (conv.customer_id === userId) return { conv, role: "customer" };

  const { data: providerRow } = await supabase
    .from("providers")
    .select("id, user_id")
    .eq("id", conv.provider_id)
    .single();

  if (providerRow && (providerRow as any).user_id === userId) {
    return { conv, role: "provider" };
  }

  const { data: staff } = await supabase
    .from("provider_staff")
    .select("id")
    .eq("provider_id", conv.provider_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (staff) return { conv, role: "provider" };

  throw Object.assign(new Error("Not authorized"), { status: 403 });
}

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request
    );
    const supabase = await getSupabaseServer(request);

    const conversationId = request.nextUrl.searchParams.get("conversation_id");
    if (!conversationId) {
      return errorResponse("conversation_id is required", "VALIDATION_ERROR", 400);
    }

    const cursor = request.nextUrl.searchParams.get("cursor");
    const limitParam = request.nextUrl.searchParams.get("limit");
    const limit = Math.min(Math.max(parseInt(limitParam || "50", 10), 1), 100);

    const { conv, role } = await verifyConversationAccess(supabase, conversationId, user.id);
    const providerBusinessName =
      typeof (conv as { provider?: { business_name?: unknown } | null }).provider?.business_name === "string"
        ? ((conv as { provider: { business_name: string } }).provider.business_name.trim() || null)
        : null;

    let query = supabase
      .from("messages")
      .select(
        `id, conversation_id, sender_id, sender_role, content, attachments, is_read, read_at, created_at, reply_to_message_id,
         sender:users!messages_sender_id_fkey(id, full_name, avatar_url)`
      )
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(limit + 1);

    if (cursor) {
      query = query.lt("created_at", cursor);
    }

    const { data: rawMessages, error } = await query;
    if (error) throw error;

    const items = rawMessages || [];
    const hasMore = items.length > limit;
    const slice = hasMore ? items.slice(0, limit) : items;

    const messages = slice.reverse();
    const nextCursor = hasMore ? slice[0]?.created_at : undefined;

    const admin = getSupabaseAdmin();
    const withReplies = await enrichMessagesWithReplyTo(admin, messages, {
      providerBusinessName,
    });

    const transformed = withReplies.map((m: any) =>
      mapMessageWithReplyFields(m, {
        id: m.id,
        conversation_id: m.conversation_id,
        sender_id: m.sender_id,
        sender_name:
          isProviderMessageRole(m.sender_role) && providerBusinessName
            ? providerBusinessName
            : m.sender?.full_name || "User",
        sender_role: m.sender_role,
        content: m.content,
        attachments: sanitizeMessageAttachmentsForResponse(m.attachments || [], m.created_at),
        is_read: Boolean(m.is_read),
        created_at: m.created_at,
        read_at: m.read_at,
      })
    );

    // Fire-and-forget: mark unread messages as read so sender sees read receipt (use admin to bypass RLS)
    markAsRead(conversationId, user.id, role).catch(() => {});

    return successResponse({
      messages: transformed,
      next_cursor: nextCursor,
      has_more: hasMore,
    });
  } catch (error: any) {
    if (error?.status === 404) return errorResponse("Conversation not found", "NOT_FOUND", 404);
    if (error?.status === 403) return errorResponse("Not authorized", "FORBIDDEN", 403);
    return handleApiError(error, "Failed to fetch messages");
  }
}

async function markAsRead(
  conversationId: string,
  userId: string,
  role: "customer" | "provider"
) {
  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();
  await Promise.all([
    admin
      .from("messages")
      .update({ is_read: true, read_at: now })
      .eq("conversation_id", conversationId)
      .eq("is_read", false)
      .neq("sender_id", userId),
    role === "customer"
      ? admin.from("conversations").update({ unread_count_customer: 0 }).eq("id", conversationId)
      : admin.from("conversations").update({ unread_count_provider: 0 }).eq("id", conversationId),
  ]);
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request
    );
    const supabase = await getSupabaseServer(request);

    const body = await request.json();
    const { conversation_id, content, attachments, reply_to_message_id } = body;

    if (!conversation_id) return errorResponse("conversation_id is required", "VALIDATION_ERROR", 400);
    if (!content && (!attachments || attachments.length === 0)) {
      return errorResponse("Message content or attachments are required", "VALIDATION_ERROR", 400);
    }

    const { conv, role } = await verifyConversationAccess(supabase, conversation_id, user.id);
    const isCustomer = role === "customer";

    let replyToId: string | null = null;
    if (reply_to_message_id != null && String(reply_to_message_id).trim()) {
      replyToId = String(reply_to_message_id).trim();
      const replyCheck = await validateReplyToMessageId(
        getSupabaseAdmin(),
        conversation_id,
        replyToId
      );
      if (replyCheck.ok === false) {
        return errorResponse(replyCheck.message, "VALIDATION_ERROR", 400);
      }
    }

    const { data: msg, error } = await (supabase.from("messages") as any)
      .insert({
        conversation_id,
        sender_id: user.id,
        sender_role: user.role,
        content: content ? String(content) : "",
        attachments: attachments || [],
        reply_to_message_id: replyToId,
        is_read: false,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw error;

    const messagePreview = content
      ? content.length > 80 ? content.slice(0, 80) + "..." : content
      : attachments?.length ? "Sent an attachment" : "";

    // Fire-and-forget: update conversation metadata + send notifications
    updateConversationMeta(supabase, conversation_id, user.id, messagePreview, isCustomer).catch(() => {});
    sendMessageNotification(conv, user, msg.id, messagePreview, isCustomer).catch((e) =>
      console.error("Notification error:", e)
    );

    return successResponse({
      id: msg.id,
      conversation_id,
      sender_id: msg.sender_id,
      sender_role: msg.sender_role,
      content: msg.content,
      reply_to_message_id: msg.reply_to_message_id ?? null,
      created_at: msg.created_at,
    });
  } catch (error: any) {
    if (error?.status === 404) return errorResponse("Conversation not found", "NOT_FOUND", 404);
    if (error?.status === 403) return errorResponse("Not authorized", "FORBIDDEN", 403);
    return handleApiError(error, "Failed to send message");
  }
}

async function updateConversationMeta(
  supabase: Awaited<ReturnType<typeof getSupabaseServer>>,
  conversationId: string,
  senderId: string,
  preview: string,
  isCustomer: boolean
) {
  const updatePayload: Record<string, any> = {
    last_message_at: new Date().toISOString(),
    last_message_preview: preview,
    last_message_sender_id: senderId,
  };
  if (isCustomer) {
    updatePayload.unread_count_provider = (await supabase
      .from("conversations")
      .select("unread_count_provider")
      .eq("id", conversationId)
      .single()
      .then(r => ((r.data as any)?.unread_count_provider ?? 0) + 1));
  } else {
    updatePayload.unread_count_customer = (await supabase
      .from("conversations")
      .select("unread_count_customer")
      .eq("id", conversationId)
      .single()
      .then(r => ((r.data as any)?.unread_count_customer ?? 0) + 1));
  }
  await supabase.from("conversations").update(updatePayload).eq("id", conversationId);
}

async function sendMessageNotification(
  conv: any,
  user: any,
  messageId: string,
  messagePreview: string,
  isCustomer: boolean
) {
  /** Service role: staff list + push fan-out must not depend on the sender's RLS scope. */
  const admin = getSupabaseAdmin();
  let recipientUserIds: string[] = [];

  if (isCustomer) {
    const { data: providerRow } = await admin
      .from("providers")
      .select("user_id")
      .eq("id", conv.provider_id)
      .maybeSingle();
    const { data: staffRows } = await admin
      .from("provider_staff")
      .select("user_id")
      .eq("provider_id", conv.provider_id)
      .eq("is_active", true);
    const ids = new Set<string>();
    const ownerId = providerRow != null ? (providerRow as { user_id?: string | null }).user_id : null;
    if (typeof ownerId === "string" && ownerId.trim()) ids.add(ownerId.trim());
    for (const row of staffRows ?? []) {
      const uid = (row as { user_id?: string | null }).user_id;
      if (typeof uid === "string" && uid.trim()) ids.add(uid.trim());
    }
    ids.delete(user.id);
    recipientUserIds = [...ids];
  } else {
    const cid = conv.customer_id;
    if (typeof cid === "string" && cid.trim()) recipientUserIds = [cid.trim()];
  }

  recipientUserIds = recipientUserIds.filter((id) => id && id !== user.id);
  if (recipientUserIds.length === 0) return;

  let providerBusinessNameForCustomer = "";
  if (!isCustomer) {
    const { data: prov } = await admin
      .from("providers")
      .select("business_name")
      .eq("id", conv.provider_id)
      .maybeSingle();
    const bn = prov != null ? (prov as { business_name?: string | null }).business_name : null;
    providerBusinessNameForCustomer =
      typeof bn === "string" && bn.trim() ? bn.trim() : "Your provider";
  }

  try {
    const { sendToUsers, sendTemplateNotification, getNotificationTemplate } = await import(
      "@/lib/notifications/onesignal"
    );
    const templateKey = isCustomer ? "provider_new_message" : "customer_new_message";
    const template = await getNotificationTemplate(templateKey);

    const appType = isCustomer ? ("provider" as const) : ("customer" as const);
    const templateVars: Record<string, string> = {
      type: "new_message",
      message_preview: messagePreview,
      conversation_id: String(conv.id),
      ...(isCustomer
        ? { sender_name: user.full_name || user.email || "Someone" }
        : { provider_name: providerBusinessNameForCustomer }),
    };
    if (template?.enabled) {
      await sendTemplateNotification(
        templateKey,
        recipientUserIds,
        templateVars,
        template.channels || ["push"],
        { appType }
      );
    } else {
      await sendToUsers(
        recipientUserIds,
        {
          title: isCustomer ? "New Message from Customer" : "New Message from Provider",
          message: messagePreview,
          data: {
            type: "new_message",
            conversation_id: conv.id,
            message_id: messageId,
            url: isCustomer ? `/provider/messaging` : `/account-settings/messages?conversation=${conv.id}`,
            deep_link: isCustomer ? `/provider/messaging` : `/account-settings/messages?conversation=${conv.id}`,
          },
          url: isCustomer ? `/provider/messaging` : `/account-settings/messages?conversation=${conv.id}`,
        },
        ["push"],
        { appType }
      );
    }
  } catch (notifError) {
    console.error("Failed to send message notification:", notifError);
  }

  try {
    const { insertNotifications } = await import("@/lib/notifications/insert-notification");
    await insertNotifications(
      recipientUserIds.map((user_id) => ({
        user_id,
        type: "new_message",
        title: isCustomer ? "New message" : "New message from provider",
        message: messagePreview,
        data: { conversation_id: conv.id, message_id: messageId },
        action_url: isCustomer ? `/provider/messaging` : `/account-settings/messages?conversation=${conv.id}`,
      }))
    );
  } catch {}
}
