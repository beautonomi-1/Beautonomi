import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, getProviderIdForUser, successResponse, handleApiError, notFoundResponse } from "@/lib/supabase/api-helpers";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/provider/conversations/[id]/mark-read
 *
 * Mark all unread customer messages in a conversation as read.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id: conversationId } = await params;
    const { user: _user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const admin = getSupabaseAdmin();
    const providerId = await getProviderIdForUser(_user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: conversation } = await admin
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("provider_id", providerId)
      .single();

    if (!conversation) {
      return notFoundResponse("Conversation not found");
    }

    const now = new Date().toISOString();

    const { error: msgError } = await admin
      .from("messages")
      .update({ read_at: now, is_read: true })
      .eq("conversation_id", conversationId)
      .eq("sender_role", "customer")
      .is("read_at", null);

    if (msgError) throw msgError;

    await admin
      .from("conversations")
      .update({ unread_count_provider: 0 })
      .eq("id", conversationId);

    return successResponse({ marked_read: true });
  } catch (error) {
    return handleApiError(error, "Failed to mark messages as read");
  }
}
