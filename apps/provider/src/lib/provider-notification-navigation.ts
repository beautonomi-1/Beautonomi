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
    /** Some pushes include workflow status for routing */
    db_status?: string;
    status?: string;
    conversation_id?: string;
    product_order_id?: string;
    order_id?: string;
    on_demand_request_id?: string;
    ticket_id?: string;
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

function calendarHrefFromNotification(link: string, data: ProviderNotificationNavPayload["data"]): string {
  const params = new URLSearchParams();
  const bookingId =
    (typeof data?.booking_id === "string" ? data.booking_id.trim() : "") ||
    getLinkParam(link, "booking_id") ||
    getLinkParam(link, "booking");
  const date =
    getLinkParam(link, "date") ||
    getLinkParam(link, "start_date") ||
    getLinkParam(link, "day");

  if (date) params.set("date", date);
  if (bookingId) params.set("booking_id", bookingId);

  const query = params.toString();
  return query ? `/(app)/(tabs)/calendar?${query}` : "/(app)/(tabs)/calendar";
}

/**
 * Map notification link/data to provider app route and navigate.
 * Shared by the header dropdown and any legacy entry points.
 */
export function navigateFromProviderNotification(router: Router, n: ProviderNotificationNavPayload): void {
  const link = n.link ?? n.action_url ?? "";
  const data = n.data ?? {};

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
    return;
  }
  if (link.includes("support/tickets") || link.includes("help/my-tickets")) {
    const m = link.match(/(?:support\/tickets|my-tickets)\/([a-f0-9-]{36})/i);
    if (m) {
      router.push(`/(app)/(tabs)/more/support-tickets/${m[1]}` as never);
    } else {
      router.push("/(app)/(tabs)/more/support-tickets" as never);
    }
    return;
  }

  if (link.includes("calendar")) {
    router.push(calendarHrefFromNotification(link, data) as never);
    return;
  }

  /** Pending confirmations & physical queue — prefer Front Desk over the bookings hub */
  const bookingIdFromPayload =
    (typeof data.booking_id === "string" && data.booking_id.trim()) ||
    getLinkParam(link, "booking_id") ||
    getLinkParam(link, "booking") ||
    "";
  const dbStatus = String(data.db_status ?? data.status ?? "").toLowerCase();
  const linkLc = link.toLowerCase();
  const nTypeLc = (n.type ?? "").toLowerCase();
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
    return;
  }

  if (data.booking_id) {
    router.push(`/(app)/(tabs)/bookings/${data.booking_id}` as never);
    return;
  }
  if (data.conversation_id) {
    router.push(`/(app)/(tabs)/chats/${data.conversation_id}` as never);
    return;
  }
  if (productOrderIdFromData) {
    router.push(
      `/(app)/(tabs)/more/orders-hub?order=${encodeURIComponent(productOrderIdFromData)}` as never,
    );
    return;
  }
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
    return;
  }
  if (link) {
    const idMatch = link.match(/\/bookings\/([a-f0-9-]+)/i) || link.match(/\/booking\/([a-f0-9-]+)/i);
    if (idMatch) {
      router.push(`/(app)/(tabs)/bookings/${idMatch[1]}` as never);
      return;
    }
    if (link.includes("messaging") || link.includes("messages")) {
      const convMatch = link.match(/conversation[=:]([a-f0-9-]+)/i) || link.match(/\/([a-f0-9-]+)$/);
      if (convMatch) {
        router.push(`/(app)/(tabs)/chats/${convMatch[1]}` as never);
      } else {
        router.push("/(app)/(tabs)/chats" as never);
      }
      return;
    }
    if (link.includes("ecommerce/orders") || link.includes("/product-orders")) {
      const oid = productOrderIdFromData;
      if (oid) {
        router.push(`/(app)/(tabs)/more/orders-hub?order=${encodeURIComponent(oid)}` as never);
      } else {
        router.push("/(app)/(tabs)/more/orders-hub" as never);
      }
      return;
    }
    if (link.includes("ecommerce/returns")) {
      router.push("/(app)/(tabs)/more/orders-hub?tab=returns" as never);
      return;
    }
    if (link.includes("clients")) {
      const clientMatch = link.match(/\/([a-f0-9-]+)$/);
      if (clientMatch) {
        router.push(`/(app)/(tabs)/more/clients/${clientMatch[1]}` as never);
      } else {
        router.push("/(app)/(tabs)/more/clients" as never);
      }
      return;
    }
    router.push("/(app)/(tabs)/dashboard" as never);
    return;
  }

  if (nType.includes("booking") || nType.includes("appointment")) {
    // Prefer the bookings hub over calendar so pending/new-booking alerts are not
    // confused with a calendar-only "front desk" view.
    router.push("/(app)/(tabs)/bookings" as never);
    return;
  }
  if (nType.includes("message") || nType.includes("chat")) {
    router.push("/(app)/(tabs)/chats" as never);
    return;
  }
  if (nType.includes("review")) {
    router.push("/(app)/(tabs)/more/reviews" as never);
    return;
  }
  if (nType.includes("payout") || nType.includes("earning")) {
    // Payouts and earnings → Finance screen (consistent with push notification routing)
    router.push("/(app)/(tabs)/more/finance" as never);
    return;
  }
  if (nType.includes("payment")) {
    // Payment notifications → Finance screen so provider sees the transaction
    router.push("/(app)/(tabs)/more/finance" as never);
    return;
  }

  router.push("/(app)/(tabs)/dashboard" as never);
}
