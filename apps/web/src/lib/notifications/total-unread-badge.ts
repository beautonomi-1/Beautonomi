import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getProviderIdForUser } from "@/lib/supabase/api-helpers";
import { getUnreadNotificationCount } from "@/lib/notifications/insert-notification";
import type { OneSignalAppType } from "@/lib/platform/secrets";

const MAX_BADGE = 999_999;

function clampBadge(n: number): number {
  return Math.min(MAX_BADGE, Math.max(0, Math.floor(n)));
}

async function getUnreadChatCount(
  userId: string,
  appType: OneSignalAppType,
): Promise<number> {
  if (!userId?.trim()) return 0;
  try {
    const supabase = getSupabaseAdmin();

    if (appType === "customer") {
      const { data, error } = await supabase
        .from("conversations")
        .select("unread_count_customer")
        .eq("customer_id", userId)
        .gt("unread_count_customer", 0);

      if (error) {
        console.warn("[getUnreadChatCount] customer query failed:", error.message);
        return 0;
      }

      return (data ?? []).reduce(
        (sum, row) => sum + Math.max(0, Number(row.unread_count_customer ?? 0)),
        0,
      );
    }

    const providerId = await getProviderIdForUser(userId, supabase as never);
    if (!providerId) return 0;

    const { data, error } = await supabase
      .from("conversations")
      .select("unread_count_provider")
      .eq("provider_id", providerId)
      .gt("unread_count_provider", 0)
      .or("is_archived_provider.is.null,is_archived_provider.eq.false");

    if (error) {
      console.warn("[getUnreadChatCount] provider query failed:", error.message);
      return 0;
    }

    return (data ?? []).reduce(
      (sum, row) => sum + Math.max(0, Number(row.unread_count_provider ?? 0)),
      0,
    );
  } catch (err) {
    console.warn("[getUnreadChatCount] unexpected error:", err);
    return 0;
  }
}

/**
 * WhatsApp-style unified badge: in-app notification unread + chat unread.
 */
export async function getTotalUnreadBadgeCount(
  userId: string,
  appType: OneSignalAppType = "customer",
): Promise<number> {
  const [notifications, chat] = await Promise.all([
    getUnreadNotificationCount(userId),
    getUnreadChatCount(userId, appType),
  ]);
  return clampBadge(notifications + chat);
}

export { getUnreadChatCount, clampBadge as clampTotalUnreadBadge };
