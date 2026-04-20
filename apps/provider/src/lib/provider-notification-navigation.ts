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
    conversation_id?: string;
    product_order_id?: string;
    order_id?: string;
    ticket_id?: string;
    [key: string]: unknown;
  };
};

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
      : "";

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

  if (data.booking_id) {
    router.push(`/(app)/(tabs)/more/bookings/${data.booking_id}` as never);
    return;
  }
  if (data.conversation_id) {
    router.push(`/(app)/(tabs)/more/messaging/${data.conversation_id}` as never);
    return;
  }
  if (productOrderIdFromData) {
    router.push(
      `/(app)/(tabs)/more/orders-hub?order=${encodeURIComponent(productOrderIdFromData)}` as never,
    );
    return;
  }
  if (link) {
    const idMatch = link.match(/\/bookings\/([a-f0-9-]+)/i) || link.match(/\/booking\/([a-f0-9-]+)/i);
    if (idMatch) {
      router.push(`/(app)/(tabs)/more/bookings/${idMatch[1]}` as never);
      return;
    }
    if (link.includes("messaging") || link.includes("messages")) {
      const convMatch = link.match(/conversation[=:]([a-f0-9-]+)/i) || link.match(/\/([a-f0-9-]+)$/);
      if (convMatch) {
        router.push(`/(app)/(tabs)/more/messaging/${convMatch[1]}` as never);
      } else {
        router.push("/(app)/(tabs)/more/messaging" as never);
      }
      return;
    }
    if (link.includes("calendar")) {
      router.push("/(app)/(tabs)/calendar" as never);
      return;
    }
    if (link.includes("ecommerce/orders") || link.includes("/product-orders")) {
      const q = link.match(/order=([a-f0-9-]+)/i);
      const oid =
        q?.[1] ??
        (typeof data.order_id === "string" && data.order_id.trim() ? data.order_id.trim() : "");
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

  const nType = (n.type ?? "").toLowerCase();
  if (nType.includes("booking") || nType.includes("appointment")) {
    router.push("/(app)/(tabs)/calendar" as never);
    return;
  }
  if (nType.includes("message") || nType.includes("chat")) {
    router.push("/(app)/(tabs)/more/messaging" as never);
    return;
  }
  if (nType.includes("review")) {
    router.push("/(app)/(tabs)/more/reviews" as never);
    return;
  }
  if (nType.includes("payment") || nType.includes("payout")) {
    router.push("/(app)/(tabs)/more/settings/payments" as never);
    return;
  }

  router.push("/(app)/(tabs)/dashboard" as never);
}
