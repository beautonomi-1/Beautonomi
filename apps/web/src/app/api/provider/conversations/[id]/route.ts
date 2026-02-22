import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getProviderIdForUser, successResponse, handleApiError, notFoundResponse } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";

/**
 * GET /api/provider/conversations/[id]
 *
 * Get a single conversation with messages (used by mobile chat screen)
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
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("id, customer_id, provider_id, booking_id, last_message_at, last_message_preview, unread_count_provider, created_at")
      .eq("id", conversationId)
      .eq("provider_id", providerId)
      .single();

    if (convError || !conversation) {
      return notFoundResponse("Conversation not found");
    }

    // Fetch customer info
    const supabaseAdmin = await getSupabaseAdmin();
    const { data: customer } = await supabaseAdmin
      .from("users")
      .select("id, full_name, email, avatar_url")
      .eq("id", conversation.customer_id)
      .single();

    let customerName = "Customer";
    if (customer?.full_name?.trim()) {
      customerName = customer.full_name.trim();
    } else if (customer?.email) {
      customerName = customer.email;
    }

    // Fetch messages
    const { data: messages, error: msgError } = await supabase
      .from("messages")
      .select("id, conversation_id, sender_id, sender_role, content, attachments, is_read, read_at, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (msgError) throw msgError;

    // Mark unread messages as read
    await supabase
      .from("messages")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("conversation_id", conversationId)
      .eq("is_read", false)
      .neq("sender_id", user.id);

    await supabase
      .from("conversations")
      .update({ unread_count_provider: 0 })
      .eq("id", conversationId);

    const transformedMessages = (messages || []).map((msg: any) => ({
      id: msg.id,
      content: msg.content,
      sender_type: msg.sender_role === "customer" ? "customer" : "provider",
      created_at: msg.created_at,
      read_at: msg.read_at,
      attachments: msg.attachments ?? [],
    }));

    return successResponse({
      id: conversation.id,
      customer_id: conversation.customer_id,
      customer_name: customerName,
      customer_avatar_url: customer?.avatar_url || null,
      messages: transformedMessages,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch conversation");
  }
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
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Verify the conversation belongs to this provider
    const { data: conversation, error: fetchError } = await supabase
      .from("conversations")
      .select("id, customer_id, provider_id")
      .eq("id", conversationId)
      .eq("provider_id", providerId)
      .single();

    if (fetchError || !conversation) {
      return notFoundResponse("Conversation not found or you don't have permission to delete it");
    }

    // Soft delete: Delete the conversation (hard delete for now, can be changed to soft delete later)
    // For soft delete, we could add a `provider_deleted_at` field and filter it out in queries
    const { error: deleteError } = await supabase
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
