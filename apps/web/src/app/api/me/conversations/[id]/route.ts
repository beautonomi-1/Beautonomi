import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError, notFoundResponse } from "@/lib/supabase/api-helpers";
import { getBlockedUserIds } from "@/lib/safety/user-blocks";

function mapConversationRow(c: Record<string, unknown>) {
  const provider = Array.isArray(c.provider) ? c.provider[0] : c.provider;
  const booking = Array.isArray(c.booking) ? c.booking[0] : c.booking;
  const p = provider as Record<string, unknown> | null | undefined;
  const b = booking as Record<string, unknown> | null | undefined;
  return {
    id: c.id,
    booking_id: c.booking_id || null,
    provider_id: c.provider_id || null,
    customer_id: c.customer_id,
    last_message_at: c.last_message_at,
    unread_count: (c.unread_count_customer as number | undefined) ?? 0,
    provider_name: (p?.business_name as string | undefined) || null,
    provider_phone: (p?.phone as string | undefined) || null,
    provider_email: (p?.email as string | undefined) || null,
    booking_number: (b?.booking_number as string | undefined) || null,
    avatar: (p?.avatar_url as string | undefined) ?? (p?.thumbnail_url as string | undefined) ?? null,
    last_message_preview: (c.last_message_preview as string | undefined) || null,
    provider: p
      ? {
          business_name: p.business_name,
          slug: p.slug ?? null,
          thumbnail_url: p.thumbnail_url,
          avatar_url: p.avatar_url ?? null,
        }
      : undefined,
    provider_slug: (p?.slug as string | undefined) ?? null,
    provider_owner_user_id: (p?.user_id as string | undefined) ?? null,
    unread_count_customer: (c.unread_count_customer as number | undefined) ?? 0,
    is_pinned: Boolean(c.is_starred_customer),
  };
}

/**
 * GET /api/me/conversations/[id]
 *
 * Single conversation metadata for chat header (customer-owned).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request,
    );
    const { id: conversationId } = await params;
    if (!conversationId) {
      return notFoundResponse("Conversation ID is required");
    }

    const supabase = await getSupabaseServer(request);
    const { data: conversation, error } = await supabase
      .from("conversations")
      .select(
        `
        id,
        booking_id,
        provider_id,
        customer_id,
        last_message_at,
        last_message_preview,
        unread_count_customer,
        unread_count_provider,
        is_starred_customer,
        provider:providers(id, user_id, slug, business_name, thumbnail_url, avatar_url, phone, email),
        booking:bookings(id, booking_number)
      `,
      )
      .eq("id", conversationId)
      .eq("customer_id", user.id)
      .maybeSingle();

    if (error) throw error;
    if (!conversation) {
      return notFoundResponse("Conversation not found");
    }

    const blockedIds = await getBlockedUserIds(user.id, supabase);
    const provider = Array.isArray(conversation.provider)
      ? conversation.provider[0]
      : conversation.provider;
    const ownerId = (provider as { user_id?: string } | null)?.user_id ?? null;
    if (ownerId && blockedIds.has(ownerId)) {
      return notFoundResponse("Conversation not found");
    }

    return successResponse(mapConversationRow(conversation as Record<string, unknown>));
  } catch (error) {
    return handleApiError(error, "Failed to fetch conversation");
  }
}

/**
 * DELETE /api/me/conversations/[id]
 *
 * Delete a conversation from the customer's view.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);
    const { id: conversationId } = await params;

    if (!conversationId) {
      return notFoundResponse("Conversation ID is required");
    }

    // Use admin client so RLS doesn't block the lookup even if user auth state differs
    const supabase = getSupabaseAdmin();

    // Verify the conversation belongs to this user (as customer)
    const { data: conversation, error: fetchError } = await supabase
      .from("conversations")
      .select("id, customer_id, provider_id")
      .eq("id", conversationId)
      .eq("customer_id", user.id)
      .single();

    if (fetchError || !conversation) {
      return notFoundResponse("Conversation not found or you don't have permission to delete it");
    }

    // Soft delete: Delete the conversation (hard delete for now, can be changed to soft delete later)
    // For soft delete, we could add a `customer_deleted_at` field and filter it out in queries
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
