import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";

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
    .select("id, customer_id, provider_id")
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

    const { conv: _conv, role } = await verifyConversationAccess(supabase, conversationId, user.id);

    let query = supabase
      .from("messages")
      .select(
        `id, conversation_id, sender_id, sender_role, content, attachments, is_read, read_at, created_at,
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

    const transformed = messages.map((m: any) => ({
      id: m.id,
      conversation_id: m.conversation_id,
      sender_id: m.sender_id,
      sender_name: m.sender?.full_name || "User",
      sender_role: m.sender_role,
      content: m.content,
      attachments: m.attachments || [],
      created_at: m.created_at,
      read_at: m.read_at,
    }));

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
  const admin = await getSupabaseAdmin();
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
    const { conversation_id, content, attachments } = body;

    if (!conversation_id) return errorResponse("conversation_id is required", "VALIDATION_ERROR", 400);
    if (!content && (!attachments || attachments.length === 0)) {
      return errorResponse("Message content or attachments are required", "VALIDATION_ERROR", 400);
    }

    const { conv, role } = await verifyConversationAccess(supabase, conversation_id, user.id);
    const isCustomer = role === "customer";

    const { data: msg, error } = await (supabase.from("messages") as any)
      .insert({
        conversation_id,
        sender_id: user.id,
        sender_role: user.role,
        content: content ? String(content) : "",
        attachments: attachments || [],
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
    sendMessageNotification(supabase, conv, user, msg.id, messagePreview, isCustomer).catch((e) =>
      console.error("Notification error:", e)
    );

    return successResponse({
      id: msg.id,
      conversation_id,
      sender_id: msg.sender_id,
      sender_role: msg.sender_role,
      content: msg.content,
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
  const updatePayload: Record<string, unknown> = {
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
  supabase: Awaited<ReturnType<typeof getSupabaseServer>>,
  conv: any,
  user: any,
  messageId: string,
  messagePreview: string,
  isCustomer: boolean
) {
  let recipientUserId: string | null = null;

  if (isCustomer) {
    const { data: providerRow } = await supabase
      .from("providers")
      .select("user_id")
      .eq("id", conv.provider_id)
      .single();
    if (providerRow) recipientUserId = (providerRow as any).user_id;
  } else {
    recipientUserId = conv.customer_id;
  }

  if (!recipientUserId || recipientUserId === user.id) return;

  try {
    const { sendToUser, sendTemplateNotification, getNotificationTemplate } = await import("@/lib/notifications/onesignal");
    const templateKey = isCustomer ? "provider_new_message" : "customer_new_message";
    const template = await getNotificationTemplate(templateKey);

    if (template?.enabled) {
      await sendTemplateNotification(
        templateKey,
        [recipientUserId],
        {
          sender_name: user.full_name || user.email || "Someone",
          message_preview: messagePreview,
          conversation_id: conv.id,
        },
        template.channels || ["push"]
      );
    } else {
      await sendToUser(recipientUserId, {
        title: isCustomer ? "New Message from Customer" : "New Message from Provider",
        message: messagePreview,
        data: { type: "new_message", conversation_id: conv.id, message_id: messageId },
        url: isCustomer ? `/provider/messaging` : `/account-settings/messages?conversation=${conv.id}`,
      });
    }
  } catch {}

  try {
    await supabase.from("notifications").insert({
      user_id: recipientUserId,
      type: "new_message",
      title: isCustomer ? "New message" : "New message from provider",
      message: messagePreview,
      data: { conversation_id: conv.id, message_id: messageId },
      is_read: false,
      created_at: new Date().toISOString(),
    });
  } catch {}
}
