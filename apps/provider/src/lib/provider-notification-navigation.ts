import type { Router } from "expo-router";

/** Minimal notification shape for navigation (dropdown + legacy root screen). */
export type ProviderNotificationNavPayload = {
  id: string;
  title?: string | null;
  message?: string | null;
  type?: string | null;
  read?: boolean;
  is_read?: boolean;
  timestamp?: string;
  link?: string;
  action_url?: string;
  data?: {
    booking_id?: string;
    group_booking_id?: string;
    /** Some pushes include workflow status for routing */
    db_status?: string;
    status?: string;
    conversation_id?: string;
    product_order_id?: string;
    order_id?: string;
    on_demand_request_id?: string;
    ticket_id?: string;
    custom_request_id?: string;
    custom_offer_id?: string;
    [key: string]: unknown;
  };
};

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
 * Map notification link/data to provider app route and navigate.
 * Shared by the header dropdown and any legacy entry points.
 */
export function navigateFromProviderNotification(router: Router, n: ProviderNotificationNavPayload): boolean {
  const link = n.link ?? n.action_url ?? "";
  const data = n.data ?? {};
  const nTypeLc = (n.type ?? "").toLowerCase();
  const templateKey =
    typeof data.template_key === "string" ? data.template_key.toLowerCase() : "";

  if (
    nTypeLc === "identity_verification_approved" ||
    nTypeLc === "identity_verification_rejected" ||
    nTypeLc === "account_verification" ||
    templateKey === "identity_verification_approved" ||
    templateKey === "identity_verification_rejected" ||
    link.includes("/provider/settings/verification") ||
    link.includes("/settings/verification")
  ) {
    router.push("/(app)/(tabs)/more/settings/verification" as never);
    return true;
  }

  const productOrderIdFromData =
    typeof data.product_order_id === "string" && data.product_order_id.trim()
      ? data.product_order_id.trim()
      : typeof data.order_id === "string" && data.order_id.trim()
        ? data.order_id.trim()
        : getLinkParam(link, "product_order_id") ||
          getLinkParam(link, "order_id") ||
          getLinkParam(link, "order");

  const ticketIdFromData = typeof data.ticket_id === "string" && data.ticket_id.trim() ? data.ticket_id.trim() : "";
  if (ticketIdFromData) {
    router.push(`/(app)/(tabs)/more/support-tickets/${ticketIdFromData}` as never);
    return true;
  }
  if (link.includes("support/tickets") || link.includes("help/my-tickets")) {
    const m = link.match(/(?:support\/tickets|my-tickets)\/([a-f0-9-]{36})/i);
    if (m) {
      router.push(`/(app)/(tabs)/more/support-tickets/${m[1]}` as never);
    } else {
      router.push("/(app)/(tabs)/more/support-tickets" as never);
    }
    return true;
  }

  if (link.includes("calendar")) {
    const calendarBookingId =
      (typeof data.booking_id === "string" ? data.booking_id.trim() : "") ||
      getLinkParam(link, "booking_id") ||
      getLinkParam(link, "booking") ||
      "";
    const dateParam = getLinkParam(link, "date");
    if (calendarBookingId) {
      if (dateParam) {
        const params = new URLSearchParams();
        params.set("date", dateParam);
        params.set("booking_id", calendarBookingId);
        router.push(`/(app)/(tabs)/bookings?${params.toString()}` as never);
      } else {
        router.push(`/(app)/(tabs)/bookings/${calendarBookingId}` as never);
      }
    } else {
      router.push("/(app)/(tabs)/bookings" as never);
    }
    return true;
  }

  /** Pending confirmations & physical queue — prefer Front Desk over the bookings hub */
  const bookingIdFromPayload =
    (typeof data.booking_id === "string" && data.booking_id.trim()) ||
    getLinkParam(link, "booking_id") ||
    getLinkParam(link, "booking") ||
    "";
  const dbStatus = String(data.db_status ?? data.status ?? "").toLowerCase();
  const linkLc = link.toLowerCase();
  if (
    nTypeLc === "ads_payment_confirmed" ||
    linkLc.includes("/provider/settings/ads") ||
    linkLc.includes("settings/ads")
  ) {
    router.push("/(app)/(tabs)/more/settings/ads" as never);
    return true;
  }
  const pendingBooking =
    dbStatus === "pending" ||
    nTypeLc.includes("pending") ||
    linkLc.includes("pending_booking") ||
    Boolean(getLinkParam(link, "pending_booking_id"));
  const frontDeskIntent =
    linkLc.includes("waiting-room") ||
    linkLc.includes("waiting_room") ||
    linkLc.includes("front_desk") ||
    linkLc.includes("front-desk") ||
    linkLc.includes("frontdesk") ||
    nTypeLc.includes("waiting_room") ||
    nTypeLc.includes("front_desk") ||
    nTypeLc.includes("check_in") ||
    nTypeLc.includes("checkin");

  if (frontDeskIntent || pendingBooking) {
    const params = new URLSearchParams();
    const highlightId =
      bookingIdFromPayload ||
      getLinkParam(link, "pending_booking_id") ||
      getLinkParam(link, "highlight");
    const dateParam = getLinkParam(link, "date");
    if (dateParam) params.set("date", dateParam);
    if (highlightId) {
      params.set("highlight", highlightId);
      if (pendingBooking || dbStatus === "pending") {
        params.set("pending_booking_id", highlightId);
      } else {
        params.set("booking_id", highlightId);
      }
    }
    const q = params.toString();
    router.push((q ? `/(app)/(tabs)/more/waiting-room?${q}` : "/(app)/(tabs)/more/waiting-room") as never);
    return true;
  }

  // ── On-demand requests — must come before custom-request block so that
  //    a bare `request_id` query param is not mis-routed as a custom_request.
  const nType = (n.type ?? "").toLowerCase();
  if (nType.includes("on_demand") || nType.includes("on-demand") || link.includes("on-demand")) {
    const reqId =
      (typeof data.on_demand_request_id === "string" ? data.on_demand_request_id.trim() : "") ||
      getLinkParam(link, "on_demand_request_id") ||
      getLinkParam(link, "request_id");
    if (reqId) {
      router.push(`/(app)/on-demand/incoming/${reqId}` as never);
    } else {
      router.push("/(app)/(tabs)/bookings" as never);
    }
    return true;
  }

  // ── Custom requests / offers ─────────────────────────────────────────────
  const customRequestId =
    (typeof data.custom_request_id === "string" && data.custom_request_id.trim()
      ? data.custom_request_id.trim()
      : getLinkParam(link, "custom_request_id") ||
        getLinkParam(link, "request_id")) || "";
  if (customRequestId) {
    router.push(`/(app)/(tabs)/more/custom-requests/${customRequestId}` as never);
    return true;
  }
  if (
    nTypeLc === "custom_offer" ||
    nTypeLc === "custom_request" ||
    nTypeLc.includes("custom_request")
  ) {
    router.push("/(app)/(tabs)/more/custom-requests" as never);
    return true;
  }

  if (data.booking_id) {
    const dateParam = getLinkParam(link, "date");
    const params = new URLSearchParams();
    if (dateParam) params.set("date", dateParam);
    params.set("booking_id", String(data.booking_id));
    const q = params.toString();
    router.push((q ? `/(app)/(tabs)/bookings?${q}` : `/(app)/(tabs)/bookings/${data.booking_id}`) as never);
    return true;
  }
  if (data.conversation_id) {
    router.push(`/(app)/(tabs)/chats/${data.conversation_id}` as never);
    return true;
  }
  if (productOrderIdFromData) {
    router.push(
      `/(app)/(tabs)/more/orders-hub?order=${encodeURIComponent(productOrderIdFromData)}` as never,
    );
    return true;
  }
  if (link) {
    const groupBookingId =
      (typeof data.group_booking_id === "string" && data.group_booking_id.trim()) ||
      getLinkParam(link, "group_booking_id") ||
      getLinkParam(link, "open_group_id") ||
      getUuidAfterSegment(link, "group-bookings");
    if (groupBookingId || link.includes("group-bookings")) {
      const route = groupBookingId
        ? `/(app)/(tabs)/more/group-bookings?open_group_id=${encodeURIComponent(groupBookingId)}`
        : "/(app)/(tabs)/more/group-bookings";
      router.push(route as never);
      return true;
    }
    const idMatch = link.match(/\/bookings\/([a-f0-9-]+)/i) || link.match(/\/booking\/([a-f0-9-]+)/i);
    if (idMatch) {
      router.push(`/(app)/(tabs)/bookings/${idMatch[1]}` as never);
      return true;
    }
    if (link.includes("messaging") || link.includes("messages")) {
      const convMatch = link.match(/conversation[=:]([a-f0-9-]+)/i) || link.match(/\/([a-f0-9-]+)$/);
      if (convMatch) {
        router.push(`/(app)/(tabs)/chats/${convMatch[1]}` as never);
      } else {
        router.push("/(app)/(tabs)/chats" as never);
      }
      return true;
    }
    if (link.includes("ecommerce/orders") || link.includes("/product-orders")) {
      const oid = productOrderIdFromData;
      if (oid) {
        router.push(`/(app)/(tabs)/more/orders-hub?order=${encodeURIComponent(oid)}` as never);
      } else {
        router.push("/(app)/(tabs)/more/orders-hub" as never);
      }
      return true;
    }
    if (link.includes("ecommerce/returns")) {
      router.push("/(app)/(tabs)/more/orders-hub?tab=returns" as never);
      return true;
    }
    if (link.includes("reports/packages")) {
      router.push("/(app)/(tabs)/more/reports/packages" as never);
      return true;
    }
    if (link.includes("reports")) {
      router.push("/(app)/(tabs)/more/reports" as never);
      return true;
    }
    if (link.includes("packages")) {
      router.push("/(app)/(tabs)/more/packages-list" as never);
      return true;
    }
    if (link.includes("express-booking") || link.includes("booking-link")) {
      router.push("/(app)/(tabs)/more/express-booking" as never);
      return true;
    }
    if (link.includes("finance") || link.includes("payout")) {
      router.push("/(app)/(tabs)/more/finance" as never);
      return true;
    }
    if (link.includes("clients")) {
      const clientMatch = link.match(/\/([a-f0-9-]+)$/);
      if (clientMatch) {
        router.push(`/(app)/(tabs)/clients/${clientMatch[1]}` as never);
      } else {
        router.push("/(app)/(tabs)/clients" as never);
      }
      return true;
    }
    return false;
  }

  if (nType.includes("booking") || nType.includes("appointment")) {
    // Prefer the bookings hub over calendar so pending/new-booking alerts are not
    // confused with a calendar-only "front desk" view.
    router.push("/(app)/(tabs)/bookings" as never);
    return true;
  }
  if (nType.includes("message") || nType.includes("chat")) {
    router.push("/(app)/(tabs)/chats" as never);
    return true;
  }
  if (nType.includes("review")) {
    router.push("/(app)/(tabs)/more/reviews" as never);
    return true;
  }
  if (nType.includes("payout") || nType.includes("earning")) {
    // Payouts and earnings → Finance screen (consistent with push notification routing)
    router.push("/(app)/(tabs)/more/finance" as never);
    return true;
  }
  if (nType.includes("payment")) {
    // Payment notifications → Finance screen so provider sees the transaction
    router.push("/(app)/(tabs)/more/finance" as never);
    return true;
  }

  return false;
}
