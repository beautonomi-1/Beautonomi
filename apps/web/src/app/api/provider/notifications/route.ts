import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, getProviderIdForUser, successResponse, handleApiError } from "@/lib/supabase/api-helpers";

const NOTIFICATIONS_LIST_CACHE_TTL_MS = 5000;
const MAX_NOTIFICATIONS_CACHE_ENTRIES = 400;
const notificationsListCache = new Map<
  string,
  { expiresAt: number; payload: { notifications: unknown[]; total_unread: number } }
>();

function pruneNotificationsCache(now: number): void {
  for (const [key, entry] of notificationsListCache.entries()) {
    if (entry.expiresAt <= now) {
      notificationsListCache.delete(key);
    }
  }
  if (notificationsListCache.size <= MAX_NOTIFICATIONS_CACHE_ENTRIES) return;
  const overflow = notificationsListCache.size - MAX_NOTIFICATIONS_CACHE_ENTRIES;
  let removed = 0;
  for (const key of notificationsListCache.keys()) {
    notificationsListCache.delete(key);
    removed += 1;
    if (removed >= overflow) break;
  }
}

/**
 * GET /api/provider/notifications
 *
 * Get provider's notifications. Uses admin client so RLS doesn't block rows;
 * ownership is enforced via the explicit user_id filter.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff'], request);
    const supabase = getSupabaseAdmin();

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return successResponse({
        notifications: [],
        total_unread: 0,
      });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "20");
    const unreadOnly = searchParams.get("unread_only") === "true";

    const listCacheKey = `${user.id}:${limit}:${unreadOnly}`;
    const cached = notificationsListCache.get(listCacheKey);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      return successResponse(cached.payload);
    }

    let query = supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (unreadOnly) {
      query = query.eq("is_read", false);
    }

    const { data: notifications, error } = await query;

    if (error) {
      console.warn("Error fetching provider notifications:", error);
      return successResponse({ notifications: [], total_unread: 0 });
    }

    // Get unread count
    const { count: unreadCount } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_read", false);
    
    // Transform notifications to match frontend expectations (map is_read to read, action_url to link)
    const transformedNotifications = (notifications || []).map((n: any) => ({
      ...n,
      read: n.is_read,
      timestamp: n.created_at,
      link: n.link ?? n.action_url ?? undefined,
    }));

    const payload = {
      notifications: transformedNotifications,
      total_unread: unreadCount || 0,
    };
    notificationsListCache.set(listCacheKey, {
      expiresAt: now + NOTIFICATIONS_LIST_CACHE_TTL_MS,
      payload,
    });
    pruneNotificationsCache(now);

    return successResponse(payload);
  } catch (error) {
    return handleApiError(error, "Failed to fetch notifications");
  }
}
