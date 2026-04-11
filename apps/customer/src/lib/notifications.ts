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
    order_id?: string;
    request_id?: string;
    review_id?: string;
    on_demand_request_id?: string;
    subtype?: string;
    type?: string;
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
 * Navigate to the appropriate screen based on notification type, data, and link.
 *
 * Priority:
 *   1. Explicit data fields (conversation_id, booking_id, order_id, etc.)
 *   2. notification `type` string
 *   3. link / action_url heuristics
 */
export function navigateFromNotification(n: Notification): void {
  const link = n.link ?? n.action_url ?? "";
  const data = n.data ?? {};
  const nType = (n.type ?? "").toLowerCase();
  const subtype = data.subtype != null ? String(data.subtype).toLowerCase() : "";
  const dataType = data.type != null ? String(data.type).toLowerCase() : "";

  // ── On-demand ────────────────────────────────────────────────────────────
  if (subtype === "on_demand_declined" || dataType === "on_demand_declined" || nType === "on_demand_declined") {
    const rid = data.on_demand_request_id != null ? String(data.on_demand_request_id) : "";
    if (rid) {
      router.push({ pathname: "/(app)/on-demand/result", params: { status: "declined", requestId: rid } });
      return;
    }
  }
  if (subtype === "on_demand_accepted" || dataType === "on_demand_accepted" || nType === "on_demand_accepted") {
    const rid = data.on_demand_request_id != null ? String(data.on_demand_request_id) : "";
    if (rid) {
      router.push({ pathname: "/(app)/on-demand/result", params: { status: "accepted", requestId: rid } });
      return;
    }
  }

  // ── Support tickets ────────────────────────────────────────────────────
  if (data.ticket_id) {
    router.push("/(app)/help" as never);
    return;
  }

  // ── Conversations / messages ─────────────────────────────────────────────
  if (data.conversation_id) {
    router.push({ pathname: "/(app)/chat", params: { id: data.conversation_id } });
    return;
  }
  if (nType === "new_message" || nType === "message" || nType === "chat_message") {
    router.push("/(app)/(tabs)/chats" as never);
    return;
  }

  // ── Bookings ─────────────────────────────────────────────────────────────
  if (data.booking_id) {
    router.push({ pathname: "/(app)/booking-detail", params: { id: data.booking_id } });
    return;
  }
  if (
    nType === "new_appointment" ||
    nType === "booking_confirmation" ||
    nType === "booking_update" ||
    nType === "booking_status_update" ||
    nType === "booking_reminder" ||
    nType === "booking_cancelled" ||
    nType === "booking_reschedule" ||
    nType === "payment_required"
  ) {
    router.push("/(app)/account-settings/bookings");
    return;
  }

  // ── Custom requests / offers ─────────────────────────────────────────────
  if (data.request_id) {
    router.push("/(app)/account-settings/custom-requests");
    return;
  }
  if (nType === "custom_request" || nType === "custom_offer" || nType === "custom_request_update") {
    router.push("/(app)/account-settings/custom-requests");
    return;
  }

  // ── Product orders ───────────────────────────────────────────────────────
  if (data.order_id) {
    router.push({ pathname: "/(app)/product-order-detail", params: { id: data.order_id } });
    return;
  }
  if (nType === "order_update" || nType === "product_order_update" || nType === "order_confirmed" || nType === "order_shipped" || nType === "order_delivered") {
    router.push("/(app)/product-orders");
    return;
  }

  // ── Returns ──────────────────────────────────────────────────────────────
  if (nType === "return_update" || nType === "return_approved" || nType === "return_rejected") {
    router.push("/(app)/my-returns");
    return;
  }

  // ── Reviews ──────────────────────────────────────────────────────────────
  if (data.review_id || nType === "review_request" || nType === "review_response") {
    router.push("/(app)/account-settings/reviews");
    return;
  }

  // ── Loyalty / referrals / payments ───────────────────────────────────────
  if (nType === "loyalty_points" || nType === "loyalty_milestone" || nType === "points_earned" || nType === "points_expiring") {
    router.push("/(app)/account-settings/loyalty");
    return;
  }
  if (nType === "referral_bonus" || nType === "referral_joined") {
    router.push("/(app)/account-settings/referrals");
    return;
  }
  if (nType === "payment_success" || nType === "payment_successful" || nType === "payment_failed" || nType === "refund_processed") {
    router.push("/(app)/account-settings/payments");
    return;
  }
  if (nType === "support_ticket" || nType === "ticket_update" || nType === "ticket_reply") {
    router.push("/(app)/help" as never);
    return;
  }
  if (nType === "waitlist_available" || nType === "waitlist_update") {
    router.push("/(app)/account-settings/waitlist");
    return;
  }

  // ── Link / action_url heuristics (fallback) ───────────────────────────────
  if (link) {
    if (link.includes("/account-settings/bookings/") || link.includes("/bookings/")) {
      const id = link.split("/").filter(Boolean).pop();
      if (id && id.length > 8) {
        router.push({ pathname: "/(app)/booking-detail", params: { id } });
        return;
      }
    }
    if (link.includes("waitlist")) { router.push("/(app)/account-settings/waitlist"); return; }
    if (link.includes("my-returns") || link.includes("returns")) { router.push("/(app)/my-returns"); return; }
    if (link.includes("product-orders") || link.includes("/orders")) { router.push("/(app)/product-orders"); return; }
    if (link.includes("custom-requests")) { router.push("/(app)/account-settings/custom-requests"); return; }
    if (link.includes("referrals")) { router.push("/(app)/account-settings/referrals"); return; }
    if (link.includes("loyalty")) { router.push("/(app)/account-settings/loyalty"); return; }
    if (link.includes("payments")) { router.push("/(app)/account-settings/payments"); return; }
    if (link.includes("messaging") || link.includes("messages")) { router.push("/(app)/(tabs)/chats" as never); return; }
    if (link.includes("bookings")) { router.push("/(app)/account-settings/bookings"); return; }
    if (link.includes("my-tickets") || link.includes("support")) { router.push("/(app)/help" as never); return; }
  }

  router.push("/(app)/notifications" as never);
}
