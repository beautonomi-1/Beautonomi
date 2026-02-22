import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getProviderIdForUser, successResponse, handleApiError, notFoundResponse } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/provider/conversations/[id]/mark-read
 *
 * Mark all unread customer messages in a conversation as read.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id: conversationId } = await params;
    const permissionCheck = await requirePermission("view_messages", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: conversation } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("provider_id", providerId)
      .single();

    if (!conversation) {
      return notFoundResponse("Conversation not found");
    }

    const now = new Date().toISOString();

    const { error } = await supabase
      .from("messages")
      .update({ read_at: now })
      .eq("conversation_id", conversationId)
      .eq("sender_type", "customer")
      .is("read_at", null);

    if (error) throw error;

    return successResponse({ marked_read: true });
  } catch (error) {
    return handleApiError(error, "Failed to mark messages as read");
  }
}
