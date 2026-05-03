import { router } from "expo-router";
import * as Linking from "expo-linking";

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
    ticket_id?: string;
    order_id?: string;
    product_order_id?: string;
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

/** Ionicons name for notification list rows (map by `type`). */
export function iconNameForNotificationType(type: string): string {
  const t = (type || "").toLowerCase();
  if (t.includes("message") || t.includes("chat")) return "chatbubble-ellipses-outline";
  if (t.includes("booking") || t.includes("appointment") || t.includes("reminder")) return "calendar-outline";
  if (t.includes("order") || t.includes("product") || t.includes("ship")) return "bag-outline";
  if (t.includes("payment") || t.includes("refund") || t.includes("wallet")) return "card-outline";
  if (t.includes("review")) return "star-outline";
  if (t.includes("loyalty") || t.includes("point") || t.includes("referral") || t.includes("gift")) return "gift-outline";
  if (t.includes("waitlist")) return "hourglass-outline";
  if (t.includes("custom") || t.includes("request") || t.includes("offer")) return "briefcase-outline";
  if (t.includes("return")) return "arrow-undo-outline";
  if (t.includes("ticket") || t.includes("support") || t.includes("help")) return "help-circle-outline";
  if (t.includes("on_demand") || t.includes("ondemand")) return "flash-outline";
  return "notifications-outline";
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

function getLinkParam(link: string, key: string): string {
  if (!link) return "";
  try {
    const parsed = new URL(link, "https://beautonomi.local");
    return parsed.searchParams.get(key)?.trim() ?? "";
  } catch {
    const match = link.match(new RegExp(`[?&]${key}=([^&#]+)`, "i"));
    return match?.[1] ? decodeURIComponent(match[1]).trim() : "";
  }
}

function getUuidAfterSegment(link: string, segment: string): string {
  const escaped = segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = link.match(new RegExp(`${escaped}/([a-f0-9-]{36})`, "i"));
  return match?.[1] ?? "";
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

  // OneSignal template pushes often include only `booking_id` in additional data (no type);
  // send users to the booking, not a generic fallthrough screen.
  const anyBookingIdRaw = data.booking_id ?? (data as { bookingId?: unknown }).bookingId;
  const directBookingId =
    anyBookingIdRaw != null && String(anyBookingIdRaw).trim() !== "" ? String(anyBookingIdRaw).trim() : "";
  if (!nType && !subtype && !dataType && directBookingId && !data.conversation_id) {
    router.push({ pathname: "/(app)/booking-detail", params: { id: directBookingId } });
    return;
  }

  const adminBroadcastPath =
    typeof data.url === "string"
      ? data.url.trim()
      : typeof data.deep_link === "string"
        ? String(data.deep_link).trim()
        : "";
  if (nType === "admin_broadcast" || dataType === "admin_broadcast") {
    const u = adminBroadcastPath || link;
    if (u && (u.startsWith("http://") || u.startsWith("https://"))) {
      void Linking.openURL(u);
      return;
    }
    if (u && u.startsWith("/")) {
      router.push(u as never);
      return;
    }
    router.push("/(app)/notifications" as never);
    return;
  }

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
  if (subtype === "on_demand_expired" || dataType === "on_demand_expired" || nType === "on_demand_expired") {
    const rid = data.on_demand_request_id != null ? String(data.on_demand_request_id) : "";
    if (rid) {
      router.push({ pathname: "/(app)/on-demand/result", params: { status: "expired", requestId: rid } });
      return;
    }
    router.push("/(app)/(tabs)/bookings" as never);
    return;
  }

  // ── Support tickets ────────────────────────────────────────────────────
  if (data.ticket_id) {
    const tid = String(data.ticket_id).trim();
    if (tid) {
      router.push(`/(app)/(tabs)/support-tickets/${tid}` as never);
      return;
    }
  }

  // ── Conversations / messages ─────────────────────────────────────────────
  if (data.conversation_id) {
    router.push({ pathname: "/(app)/chat", params: { id: data.conversation_id } });
    return;
  }
  const linkedConversationId =
    getLinkParam(link, "conversation") ||
    getLinkParam(link, "conversation_id") ||
    getUuidAfterSegment(link, "messages") ||
    getUuidAfterSegment(link, "messaging");
  if (linkedConversationId) {
    router.push({ pathname: "/(app)/chat", params: { id: linkedConversationId } });
    return;
  }
  if (nType === "new_message" || nType === "message" || nType === "chat_message") {
    router.push("/(app)/(tabs)/chats" as never);
    return;
  }

  // ── Bookings ─────────────────────────────────────────────────────────────
  if (anyBookingIdRaw) {
    router.push({ pathname: "/(app)/booking-detail", params: { id: String(anyBookingIdRaw) } });
    return;
  }
  if (
    nType === "new_appointment" ||
    nType === "booking_confirmation" ||
    nType === "booking_update" ||
    nType === "booking_status_update" ||
    nType === "booking_reminder" ||
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
  if (nType === "custom_request" || nType === "custom_offer" || nType === "custom_request_update" || nType === "custom_request_response") {
    router.push("/(app)/account-settings/custom-requests");
    return;
  }

  if (nType === "explore_post") {
    const pid = data.post_id != null ? String(data.post_id) : "";
    if (pid) {
      router.push({ pathname: "/(app)/explore-post", params: { id: pid } });
    } else {
      router.push("/(app)/(tabs)/explore" as never);
    }
    return;
  }
  if (nType === "promotion" || nType === "marketing") {
    if (data.provider_slug) {
      router.push({
        pathname: "/(app)/partner-profile",
        params: { slug: String(data.provider_slug) },
      });
    } else {
      router.push("/(app)/(tabs)/explore" as never);
    }
    return;
  }

  // ── Product orders ───────────────────────────────────────────────────────
  const productOrderId =
    (data.product_order_id != null ? String(data.product_order_id).trim() : "") ||
    (data.order_id != null ? String(data.order_id).trim() : "") ||
    getLinkParam(link, "product_order_id") ||
    getLinkParam(link, "order_id") ||
    getLinkParam(link, "order") ||
    getUuidAfterSegment(link, "orders");
  if (productOrderId) {
    router.push({ pathname: "/(app)/product-order-detail", params: { id: productOrderId } });
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
  if (
    nType === "payment_received" ||
    nType === "payment_pending" ||
    nType === "payment_method_expired" ||
    nType === "partial_payment_received" ||
    nType === "provider_arrived" ||
    nType === "booking_confirmed" ||
    nType === "booking_cancelled" ||
    nType === "booking_updated" ||
    nType === "booking_completed"
  ) {
    const bid =
      (data.booking_id != null ? String(data.booking_id) : "") ||
      (data.bookingId != null ? String(data.bookingId) : "");
    if (bid) {
      router.push({ pathname: "/(app)/booking-detail", params: { id: bid } });
    } else if (nType.startsWith("payment_") || nType === "partial_payment_received") {
      router.push("/(app)/account-settings/payments");
    } else {
      router.push("/(app)/(tabs)/bookings" as never);
    }
    return;
  }
  if (nType === "support_ticket" || nType === "ticket_update" || nType === "ticket_reply") {
    const tid = data.ticket_id != null ? String(data.ticket_id).trim() : "";
    if (tid) {
      router.push(`/(app)/(tabs)/support-tickets/${tid}` as never);
    } else {
      router.push("/(app)/(tabs)/support-tickets" as never);
    }
    return;
  }
  if (nType === "waitlist_available" || nType === "waitlist_update") {
    router.push("/(app)/account-settings/waitlist");
    return;
  }

  // ── Link / action_url heuristics (fallback) ───────────────────────────────
  if (link) {
    if (link.includes("/account-settings/bookings/") || link.includes("/bookings/")) {
      const segments = link.split("/").filter(Boolean);
      const bookingsIdx = segments.findIndex((s) => s === "bookings");
      const bookingId = bookingsIdx >= 0 && bookingsIdx + 1 < segments.length ? segments[bookingsIdx + 1] : null;
      if (bookingId && bookingId.length > 8) {
        router.push({ pathname: "/(app)/booking-detail", params: { id: bookingId } });
        return;
      }
    }
    const orderIdFromPath = getUuidAfterSegment(link, "orders");
    if (orderIdFromPath) {
      router.push({ pathname: "/(app)/product-order-detail", params: { id: orderIdFromPath } });
      return;
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
    if (link.includes("contact-support")) {
      router.push("/(app)/(tabs)/support-tickets/new" as never);
      return;
    }
    if (link.includes("my-tickets") || link.includes("/help/my-tickets")) {
      const m = link.match(/my-tickets\/([a-f0-9-]{36})/i) || link.match(/ticket[s]?\/([a-f0-9-]{36})/i);
      const tid = m?.[1];
      if (tid) router.push(`/(app)/(tabs)/support-tickets/${tid}` as never);
      else router.push("/(app)/(tabs)/support-tickets" as never);
      return;
    }
    if (link.includes("support-ticket") && !link.includes("admin")) {
      router.push("/(app)/(tabs)/support-tickets" as never);
      return;
    }
  }

  router.push("/(app)/notifications" as never);
}
