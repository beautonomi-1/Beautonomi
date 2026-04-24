import "server-only";

import { createNextRequestFromHeaders } from "@/lib/server/create-next-request";
import { GET as getNotifications } from "@/app/api/me/notifications/route";
import type { InboxNotification, NotificationsInboxInitial } from "./notification-inbox-types";

export async function fetchNotificationsInboxInitial(): Promise<NotificationsInboxInitial | null> {
  const req = await createNextRequestFromHeaders("/api/me/notifications?limit=50");
  const res = await getNotifications(req);
  const json = (await res.json().catch(() => ({}))) as {
    data?: { notifications?: InboxNotification[]; total_unread?: number };
  };
  if (!res.ok) return null;
  const data = json.data;
  if (!data) return null;
  return {
    notifications: Array.isArray(data.notifications) ? data.notifications : [],
    total_unread: typeof data.total_unread === "number" ? data.total_unread : 0,
  };
}
