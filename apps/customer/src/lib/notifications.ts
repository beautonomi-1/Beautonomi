import { router } from "expo-router";

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  data?: {
    conversation_id?: string;
    booking_id?: string;
    [key: string]: unknown;
  };
  link?: string;
  action_url?: string;
}

export function formatNotificationTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString();
}

/**
 * Navigate to the appropriate screen based on notification data (conversation_id, booking_id, link).
 */
export function navigateFromNotification(n: Notification): void {
  const link = n.link ?? n.action_url ?? "";
  const data = n.data ?? {};

  if (data.conversation_id) {
    router.push({ pathname: "/(app)/chat", params: { id: data.conversation_id } });
    return;
  }
  if (data.booking_id) {
    router.push({ pathname: "/(app)/booking-detail", params: { id: data.booking_id } });
    return;
  }

  if (link) {
    if (link.includes("/account-settings/bookings/") || link.includes("/bookings/")) {
      const id = link.split("/").filter(Boolean).pop();
      if (id) router.push({ pathname: "/(app)/booking-detail", params: { id } });
      return;
    }
    if (link.includes("waitlist")) {
      router.push("/(app)/account-settings/waitlist");
      return;
    }
    if (link.includes("returns") || link.includes("product-orders") || link.includes("/orders")) {
      router.push("/(app)/product-orders");
      return;
    }
    if (link.includes("my-returns")) {
      router.push("/(app)/my-returns");
      return;
    }
    if (link.includes("referrals")) {
      router.push("/(app)/account-settings/referrals");
      return;
    }
    if (link.includes("loyalty")) {
      router.push("/(app)/account-settings/loyalty");
      return;
    }
    if (link.includes("payments")) {
      router.push("/(app)/account-settings/payments");
      return;
    }
    if (link.includes("bookings")) {
      router.push("/(app)/account-settings/bookings");
      return;
    }
  }
}
