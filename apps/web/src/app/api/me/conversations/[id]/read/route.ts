import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";

/**
 * Verify the caller has access to the conversation (conversations table: customer_id or provider).
 * Returns "customer" | "provider". Throws on not found / forbidden.
 */
async function verifyConversationAccess(
  supabase: Awaited<ReturnType<typeof getSupabaseServer>>,
  conversationId: string,
  userId: string
): Promise<"customer" | "provider"> {
  const { data: conv } = await supabase
    .from("conversations")
    .select("id, customer_id, provider_id")
    .eq("id", conversationId)
    .single();

  if (!conv) throw Object.assign(new Error("Conversation not found"), { status: 404 });
  if (conv.customer_id === userId) return "customer";

  const { data: providerRow } = await supabase
    .from("providers")
    .select("id, user_id")
    .eq("id", conv.provider_id)
    .single();
  const prov = providerRow as { user_id?: string } | null;
  if (prov?.user_id === userId) return "provider";

  const { data: staff } = await supabase
    .from("provider_staff")
    .select("id")
    .eq("provider_id", conv.provider_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (staff) return "provider";

  throw Object.assign(new Error("Not authorized"), { status: 403 });
}

/**
 * POST /api/me/conversations/[id]/read
 *
 * Mark messages in a conversation as read (uses conversations table, not conversation_participants).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request
    );
    const { id: conversationId } = await params;
    const supabase = await getSupabaseServer(request);

    const role = await verifyConversationAccess(supabase, conversationId, user.id);

    const admin = await getSupabaseAdmin();
    const now = new Date().toISOString();

    await admin
      .from("messages")
      .update({ is_read: true, read_at: now })
      .eq("conversation_id", conversationId)
      .eq("is_read", false)
      .neq("sender_id", user.id);

    if (role === "customer") {
      await admin.from("conversations").update({ unread_count_customer: 0 }).eq("id", conversationId);
    } else {
      await admin.from("conversations").update({ unread_count_provider: 0 }).eq("id", conversationId);
    }

    return successResponse({ success: true });
  } catch (error: unknown) {
    const err = error as { status?: number };
    if (err?.status === 404) return errorResponse("Conversation not found", "NOT_FOUND", 404);
    if (err?.status === 403) return errorResponse("Not authorized", "FORBIDDEN", 403);
    return handleApiError(error, "Failed to mark messages as read");
  }
}
