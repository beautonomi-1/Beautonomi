import { createNextRequestFromHeaders } from "@/lib/server/create-next-request";
import { GET as getProviderNotifications } from "@/app/api/provider/notifications/route";

export interface NotificationInitialRow {
  id: string;
  type: string;
  title: string;
  message: string;
  timestamp: string;
  link?: string;
  priority: "low" | "medium" | "high";
  read: boolean;
  metadata?: Record<string, unknown>;
  data?: Record<string, unknown>;
}

function apiMessage(json: unknown): string {
  if (!json || typeof json !== "object") return "Invalid response";
  const e = (json as { error?: { message?: string } | string }).error;
  if (typeof e === "object" && e?.message) return e.message;
  if (typeof e === "string") return e;
  return "Request failed";
}

/**
 * Server load for /provider/notifications — matches default "all" tab (?limit=100).
 */
export async function fetchNotificationsInitial(): Promise<{
  notifications: NotificationInitialRow[];
  totalUnread: number;
  error: string | null;
}> {
  try {
    const req = await createNextRequestFromHeaders("/api/provider/notifications?limit=100");
    const res = await getProviderNotifications(req);
    let json: {
      data?: { notifications?: NotificationInitialRow[]; total_unread?: number };
      error?: unknown;
    } = {};
    try {
      json = (await res.json()) as typeof json;
    } catch {
      return { notifications: [], totalUnread: 0, error: "Invalid response from notifications API" };
    }
    if (!res.ok) {
      return { notifications: [], totalUnread: 0, error: apiMessage(json) };
    }
    const inner = json.data;
    if (!inner) {
      return { notifications: [], totalUnread: 0, error: "Empty response from notifications API" };
    }
    return {
      notifications: inner.notifications ?? [],
      totalUnread: inner.total_unread ?? 0,
      error: null,
    };
  } catch (e) {
    return {
      notifications: [],
      totalUnread: 0,
      error: e instanceof Error ? e.message : "Failed to load notifications",
    };
  }
}
