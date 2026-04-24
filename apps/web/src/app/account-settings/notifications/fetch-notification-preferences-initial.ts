import "server-only";

import { createNextRequestFromHeaders } from "@/lib/server/create-next-request";
import { GET as getNotificationPreferences } from "@/app/api/me/notification-preferences/route";
import type { NotificationPreferences } from "./notification-preferences-types";

export async function fetchNotificationPreferencesInitial(): Promise<NotificationPreferences | null> {
  const req = await createNextRequestFromHeaders("/api/me/notification-preferences");
  const res = await getNotificationPreferences(req);
  const json = (await res.json().catch(() => ({}))) as { data?: NotificationPreferences };
  if (!res.ok) return null;
  return json.data ?? null;
}
