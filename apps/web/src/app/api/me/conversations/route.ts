import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError, getPaginationParams, createPaginatedResponse } from "@/lib/supabase/api-helpers";
import type { Conversation, PaginatedResponse } from "@/types/beautonomi";
import { getBlockedUserIds } from "@/lib/safety/user-blocks";

/**
 * GET /api/me/conversations
 *
 * Returns the current user's conversations ordered by most recent message.
 * Filters out conversations that have never had a message (no last_message_preview).
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);

    const supabase = await getSupabaseServer(request);
    const { searchParams } = new URL(request.url);

    const bookingId = searchParams.get("booking_id");
    const { page, limit, offset } = getPaginationParams(request);
    const wantsPaginated = searchParams.has("page") || searchParams.has("limit");

    let query = supabase
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
        { count: "exact" }
      )
      .eq("customer_id", user.id)
      .not("last_message_at", "is", null)
      .order("is_starred_customer", { ascending: false })
      .order("last_message_at", { ascending: false, nullsFirst: false });

    if (bookingId) {
      query = query.eq("booking_id", bookingId);
    }

    const { data: conversations, error, count } = wantsPaginated
      ? await query.range(offset, offset + limit - 1)
      : await query.limit(50);

    if (error) {
      if (error.code === 'PGRST116' || error.message?.includes('permission') || error.message?.includes('does not exist')) {
        return successResponse([]);
      }
      throw error;
    }

    const blockedIds = await getBlockedUserIds(user.id, supabase);

    const filteredConversations = (conversations || []).filter((c: any) => {
      if (blockedIds.size === 0) return true;
      const provider = Array.isArray(c.provider) ? c.provider[0] : c.provider;
      const ownerId = provider?.user_id ?? null;
      return !ownerId || !blockedIds.has(ownerId);
    });

    const mapped = filteredConversations.map((c: any) => ({
      id: c.id,
      booking_id: c.booking_id || null,
      provider_id: c.provider_id || null,
      customer_id: c.customer_id,
      last_message_at: c.last_message_at,
      unread_count: c.unread_count_customer ?? 0,
      provider_name: c.provider?.business_name || null,
      provider_phone: c.provider?.phone || null,
      provider_email: c.provider?.email || null,
      booking_number: c.booking?.booking_number || null,
      avatar: c.provider?.avatar_url ?? c.provider?.thumbnail_url ?? null,
      last_message_preview: c.last_message_preview || null,
      provider: c.provider
        ? {
            business_name: c.provider.business_name,
            slug: c.provider.slug ?? null,
            thumbnail_url: c.provider.thumbnail_url,
            avatar_url: c.provider.avatar_url ?? null,
          }
        : undefined,
      provider_slug: c.provider?.slug ?? null,
      provider_owner_user_id: (Array.isArray(c.provider) ? c.provider[0] : c.provider)?.user_id ?? null,
      unread_count_customer: c.unread_count_customer ?? 0,
      is_pinned: Boolean(c.is_starred_customer),
    }));

    if (!wantsPaginated) {
      return successResponse(mapped);
    }

    const filteredFromPage = (conversations || []).length - filteredConversations.length;
    const adjustedTotal = Math.max(0, (count ?? mapped.length) - filteredFromPage);

    const result: PaginatedResponse<Conversation> = createPaginatedResponse(
      mapped as any,
      adjustedTotal,
      page,
      limit
    );

    return successResponse(result as any);
  } catch (error) {
    return handleApiError(error, "Failed to fetch conversations");
  }
}
