import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getProviderIdForUser, successResponse, handleApiError, notFoundResponse } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { signMessageAttachmentsForResponse } from "@/lib/messaging/message-attachments";
import { enrichMessagesWithReplyTo, mapMessageWithReplyFields } from "@/lib/messaging/message-replies";
import { assertNotBlocked, UserBlockedError } from "@/lib/safety/user-blocks";

// All conversation data reads use the admin client so provider_staff are not
// blocked by RLS policies that scope reads to the authenticated JWT's user_id.

/**
 * GET /api/provider/conversations/[id]
 *
 * Get a single conversation with messages (used by mobile chat screen).
 * Marks all messages from the customer as read and sets unread_count_provider to 0 (read receipt).
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
    const { id: conversationId } = await params;
    if (!conversationId) {
      return notFoundResponse("Conversation ID is required");
    }
    const supabase = await getSupabaseServer(request);
    const supabaseAdmin = getSupabaseAdmin();
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: conversation, error: convError } = await supabaseAdmin
      .from("conversations")
      .select("id, customer_id, provider_id, booking_id, last_message_at, last_message_preview, unread_count_provider, is_starred_provider, created_at")
      .eq("id", conversationId)
      .eq("provider_id", providerId)
      .single();

    if (convError || !conversation) {
      return notFoundResponse("Conversation not found");
    }

    await assertNotBlocked(user.id, conversation.customer_id as string, supabaseAdmin);

    const { data: customer } = await supabaseAdmin
      .from("users")
      .select("id, full_name, email, phone, avatar_url, identity_verified")
      .eq("id", conversation.customer_id)
      .single();

    let customerName = "Customer";
    if (customer?.full_name?.trim()) {
      customerName = customer.full_name.trim();
    } else if (customer?.email) {
      customerName = customer.email;
    }

    const { data: providerMeta } = await supabaseAdmin
      .from("providers")
      .select("business_name")
      .eq("id", providerId)
      .maybeSingle();
    const providerBusinessName =
      typeof providerMeta?.business_name === "string" ? providerMeta.business_name.trim() : null;

    const { data: messages, error: msgError } = await supabaseAdmin
      .from("messages")
      .select("id, conversation_id, sender_id, sender_role, content, attachments, is_read, read_at, created_at, reply_to_message_id")
      .eq("conversation_id", conversationId)
      .eq("is_hidden", false)
      .order("created_at", { ascending: true });

    if (msgError) throw msgError;

    const withReplies = await enrichMessagesWithReplyTo(supabaseAdmin, messages || [], {
      providerBusinessName,
    });

    await supabaseAdmin
      .from("messages")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("conversation_id", conversationId)
      .eq("is_read", false)
      .neq("sender_id", user.id);

    await supabaseAdmin
      .from("conversations")
      .update({ unread_count_provider: 0 })
      .eq("id", conversationId);

    const transformedMessages = await Promise.all(
      withReplies.map(async (msg: any) =>
        mapMessageWithReplyFields(msg, {
          id: msg.id,
          content: msg.content,
          sender_type: msg.sender_role === "customer" ? "customer" : "provider",
          created_at: msg.created_at,
          read_at: msg.read_at,
          attachments: await signMessageAttachmentsForResponse(
            msg.attachments ?? [],
            supabaseAdmin,
            msg.created_at,
          ),
        }),
      ),
    );

    return successResponse({
      id: conversation.id,
      customer_id: conversation.customer_id,
      customer_name: customerName,
      customer_avatar_url: customer?.avatar_url || null,
      customer_phone: (customer as any)?.phone ?? null,
      customer_email: customer?.email ?? null,
      customer_identity_verified: Boolean((customer as any)?.identity_verified),
      is_pinned: Boolean((conversation as { is_starred_provider?: boolean }).is_starred_provider),
      messages: transformedMessages,
    });
  } catch (error) {
    if (error instanceof UserBlockedError || (error as { code?: string })?.code === "USER_BLOCKED") {
      return handleApiError(
        error instanceof Error ? error : new Error("You cannot interact with this user."),
        "You cannot interact with this user.",
        "USER_BLOCKED",
        403,
      );
    }
    return handleApiError(error, "Failed to fetch conversation");
  }
}

/**
 * POST /api/provider/conversations/create
 * When the client hits .../conversations/create, some routers match [id]=create.
 * Delegate to create logic so POST always works.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (id === "create") {
    const { createConversation } = await import("../_helpers/create-conversation");
    return createConversation(request);
  }
  return notFoundResponse("Conversation not found");
}

/**
 * DELETE /api/provider/conversations/[id]
 *
 * Delete a conversation (provider side - soft delete)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const permissionCheck = await requirePermission("send_messages", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const { id: conversationId } = await params;
    if (!conversationId) {
      return notFoundResponse("Conversation ID is required");
    }
    const supabase = await getSupabaseServer(request);
    const supabaseAdmin = getSupabaseAdmin();
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: conversation, error: fetchError } = await supabaseAdmin
      .from("conversations")
      .select("id, customer_id, provider_id")
      .eq("id", conversationId)
      .eq("provider_id", providerId)
      .single();

    if (fetchError || !conversation) {
      return notFoundResponse("Conversation not found or you don't have permission to delete it");
    }

    const { error: deleteError } = await supabaseAdmin
      .from("conversations")
      .delete()
      .eq("id", conversationId);

    if (deleteError) {
      throw deleteError;
    }

    return successResponse({ deleted: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete conversation");
  }
}
