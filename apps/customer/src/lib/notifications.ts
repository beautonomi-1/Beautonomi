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
    group_booking_id?: string;
    group_booking?: boolean;
    custom_offer_id?: string;
    offer_id?: string;
    custom_request_id?: string;
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
    // Match provider app: any non-web deep link (Expo paths, custom schemes) — not only `/…`.
    if (u) {
      router.push(u as never);
      return;
    }
    router.push("/(app)/announcements" as never);
    return;
  }

  // ── Identity verification outcomes ───────────────────────────────────────
  const templateKey = typeof data.template_key === "string" ? data.template_key.toLowerCase() : "";
  if (
    nType === "identity_verification_approved" ||
    nType === "identity_verification_rejected" ||
    nType === "account_verification" ||
    templateKey === "identity_verification_approved" ||
    templateKey === "identity_verification_rejected" ||
    link.includes("/account-settings/identity-verification")
  ) {
    router.push("/(app)/account-settings/identity-verification" as never);
    return;
  }

  // ── Membership win-back (provider invited a cancelled member to rejoin) ──
  if (
    nType === "membership_win_back" ||
    dataType === "membership_win_back" ||
    subtype === "membership_win_back" ||
    templateKey === "membership_win_back"
  ) {
    const providerSlug =
      (data.provider_slug != null ? String(data.provider_slug).trim() : "") ||
      getLinkParam(link, "slug");
    const providerId =
      (data.provider_id != null ? String(data.provider_id).trim() : "") ||
      getLinkParam(link, "provider_id");
    if (providerSlug || providerId) {
      router.push({
        pathname: "/(app)/partner-profile",
        params: {
          ...(providerSlug ? { slug: providerSlug } : { provider_id: providerId }),
          tab: "memberships",
        },
      } as never);
      return;
    }
    // No provider context — fall back to the customer's membership management screen.
    router.push("/(app)/account-settings/membership" as never);
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
  if (
    nType === "new_message" ||
    nType === "message" ||
    nType === "chat_message" ||
    nType === "customer_new_message"
  ) {
    router.push("/(app)/(tabs)/chats" as never);
    return;
  }

  // ── Group bookings ────────────────────────────────────────────────────────
  const groupBookingIdRaw = data.group_booking_id;
  const groupBookingId =
    groupBookingIdRaw != null && String(groupBookingIdRaw).trim() !== ""
      ? String(groupBookingIdRaw).trim()
      : "";
  if (nType === "group_booking_confirmation" || data.group_booking === true) {
    if (groupBookingId) {
      router.push({ pathname: "/(app)/group-booking-detail", params: { id: groupBookingId } });
      return;
    }
    // No group_booking_id — fall back to the individual booking if we have it.
    if (anyBookingIdRaw) {
      router.push({ pathname: "/(app)/booking-detail", params: { id: String(anyBookingIdRaw) } });
      return;
    }
    router.push("/(app)/(tabs)/bookings" as never);
    return;
  }
  if (link && (getUuidAfterSegment(link, "group-bookings") || getLinkParam(link, "group_booking_id"))) {
    const gid = getUuidAfterSegment(link, "group-bookings") || getLinkParam(link, "group_booking_id");
    if (gid) {
      router.push({ pathname: "/(app)/group-booking-detail", params: { id: gid } });
      return;
    }
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

  // ── Custom offers — open canonical checkout when we have an offer id (no booking_id: handled above)
  const offerIdFromData =
    (data.custom_offer_id != null && String(data.custom_offer_id).trim()) ||
    (data.offer_id != null && String(data.offer_id).trim()) ||
    "";
  const offerIdFromLink = getLinkParam(link, "offer_id") || getLinkParam(link, "offer");
  const offerIdTap = offerIdFromData || offerIdFromLink;
  if (offerIdTap) {
    router.push({
      pathname: "/(app)/custom-offer-checkout",
      params: { offer_id: offerIdTap },
    } as never);
    return;
  }
  if (data.request_id || data.custom_request_id) {
    router.push("/(app)/account-settings/custom-requests" as never);
    return;
  }
  if (nType === "custom_request" || nType === "custom_offer" || nType === "custom_request_update" || nType === "custom_request_response") {
    router.push("/(app)/account-settings/custom-requests" as never);
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
    nType === "additional_charge_requested" ||
    nType === "provider_on_way" ||
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
    } else if (
      nType.startsWith("payment_") ||
      nType === "partial_payment_received" ||
      nType === "additional_charge_requested"
    ) {
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
