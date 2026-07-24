/**
 * Shared provider notification routing for push taps and in-app bell rows.
 */
import { Linking } from "react-native";
import type { Router } from "expo-router";
import { captureError } from "@/lib/sentry";
import type { ProviderNotificationNavPayload } from "@/lib/provider-notification-navigation";

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

/** Keys from sendTemplateNotification(..., { appType: "provider" }). */
export const PROVIDER_BOOKING_TEMPLATE_KEYS = new Set([
  "provider_booking_request",
  "provider_booking_cancelled",
  "provider_booking_rescheduled",
  "provider_booking_time_changed",
  "provider_booking_date_changed",
  "provider_new_customer",
  "provider_recurring_customer",
  "provider_preferred_customer",
  "provider_special_instructions",
  "allergy_alert_provider",
  "provider_weather_alert",
  "provider_dispute_opened",
  "provider_dispute_resolved",
]);

export const PROVIDER_CUSTOM_REQUEST_TEMPLATE_KEYS = new Set([
  "provider_custom_request",
  "provider_custom_offer_declined",
  "provider_custom_offer_changes_requested",
  "provider_custom_request_expired",
]);

export function notificationPayloadToRouteData(
  n: ProviderNotificationNavPayload,
): Record<string, unknown> {
  const data = n.data ?? {};
  return {
    ...data,
    type: n.type ?? data.type,
    template_key: data.template_key,
    booking_id: data.booking_id,
    group_booking_id: data.group_booking_id,
    conversation_id: data.conversation_id,
    product_order_id: data.product_order_id ?? data.order_id,
    order_id: data.order_id ?? data.product_order_id,
    on_demand_request_id: data.on_demand_request_id,
    ticket_id: data.ticket_id,
    custom_request_id: data.custom_request_id,
    request_id: data.request_id,
    offer_id: data.offer_id ?? data.custom_offer_id,
    link: n.link,
    action_url: n.action_url ?? n.link,
    url: n.link,
  };
}

export function applyProviderNotificationRoute(router: Router, data: Record<string, unknown>): boolean {
  try {
    const templateKey = String(data.template_key ?? "");
    const type = String(data.type ?? data.notification_type ?? "");
    const bookingId = data.booking_id != null ? String(data.booking_id) : "";
    const clientId = data.client_id != null ? String(data.client_id) : "";
    const conversationId = String(data.conversation_id ?? data.chat_id ?? "");
    const genericId = String(
      data.id ?? data.booking_id ?? data.chat_id ?? data.conversation_id ?? data.client_id ?? "",
    );
    const onDemandRequestId = String(data.on_demand_request_id ?? data.id ?? "");
    const productOrderId = String(data.product_order_id ?? data.order_id ?? "").trim();
    const actionUrl = String(data.action_url ?? data.link ?? data.url ?? data.deep_link ?? "").trim();
    const actionUrlLc = actionUrl.toLowerCase();
    const typeLc = type.toLowerCase();
    const broadcastDeepLink =
      typeof data.url === "string"
        ? data.url.trim()
        : typeof data.deep_link === "string"
          ? String(data.deep_link).trim()
          : "";

    if (type === "admin_broadcast") {
      const u = broadcastDeepLink;
      if (u) {
        if (u.startsWith("http://") || u.startsWith("https://")) {
          void Linking.openURL(u);
        } else {
          router.push(u as never);
        }
      } else {
        router.push("/(app)/announcements" as never);
      }
      return true;
    }

    // Terminal upsell campaign pushes land in the announcements inbox
    // (their in-app rows are written as admin_broadcast with the campaign payload).
    if (type === "terminal_upsell_announcement" || templateKey === "terminal_upsell_announcement") {
      router.push("/(app)/announcements" as never);
      return true;
    }

    if (
      templateKey.startsWith("terminal_merchant_application_") ||
      data.application_id
    ) {
      router.push("/(app)/(tabs)/more/terminal-merchant-application" as never);
      return true;
    }

    if (
      templateKey === "support_ticket_updated" ||
      type === "support_ticket" ||
      type === "ticket_update" ||
      type === "ticket_reply" ||
      data.ticket_id
    ) {
      const tid = String(data.ticket_id ?? "").trim();
      if (tid) {
        router.push({ pathname: "/(app)/(tabs)/more/support-tickets/[id]", params: { id: tid } });
      } else {
        router.push("/(app)/(tabs)/more/support-tickets" as never);
      }
      return true;
    }

    if (
      typeLc === "ads_payment_confirmed" ||
      actionUrlLc.includes("/provider/settings/ads") ||
      actionUrlLc.includes("settings/ads")
    ) {
      router.push("/(app)/(tabs)/bookings" as never);
      return true;
    }

    if (templateKey === "provider_new_message") {
      const cid =
        String(data.conversation_id ?? data.chat_id ?? "") ||
        getLinkParam(actionUrl, "conversation") ||
        getLinkParam(actionUrl, "conversation_id");
      if (cid) {
        router.push({ pathname: "/(app)/(tabs)/chats/[id]", params: { id: cid } });
      } else {
        router.push("/(app)/(tabs)/chats");
      }
      return true;
    }

    if (templateKey.startsWith("provider_payout_") || templateKey === "provider_earnings_summary") {
      router.push("/(app)/(tabs)/more" as never);
      return true;
    }

    if (templateKey === "provider_new_review") {
      if (bookingId) {
        router.push({ pathname: "/(app)/(tabs)/bookings/[id]", params: { id: bookingId } });
      } else {
        router.push("/(app)/(tabs)/more/reviews");
      }
      return true;
    }

    if (templateKey === "low_stock_alert") {
      router.push("/(app)/(tabs)/more/products");
      return true;
    }

    if (templateKey.includes("product_order") || templateKey === "provider_new_product_order") {
      if (productOrderId) {
        router.push(
          `/(app)/(tabs)/more/orders-hub?order=${encodeURIComponent(productOrderId)}` as never,
        );
      } else {
        router.push("/(app)/(tabs)/more/orders-hub" as never);
      }
      return true;
    }

    if (templateKey === "provider_on_demand_request") {
      if (onDemandRequestId) {
        router.push({
          pathname: "/(app)/on-demand/incoming/[id]",
          params: { id: onDemandRequestId },
        });
      } else {
        router.push("/(app)/(tabs)/bookings");
      }
      return true;
    }

    if (templateKey === "provider_waiting_room" || templateKey === "provider_check_in") {
      router.push("/(app)/(tabs)/more/waiting-room");
      return true;
    }

    if (
      templateKey === "provider_availability_changed" ||
      templateKey === "provider_holiday_mode" ||
      templateKey === "provider_holiday_mode_ending"
    ) {
      router.push("/(app)/(tabs)/more/time-blocks" as never);
      return true;
    }

    if (templateKey === "provider_break_scheduled") {
      router.push("/(app)/(tabs)/more/time-blocks");
      return true;
    }

    if (
      templateKey === "provider_approved" ||
      templateKey === "provider_reactivated"
    ) {
      // Approved / reactivated — take provider to their live dashboard.
      router.push("/(app)/(tabs)/dashboard");
      return true;
    }

    if (
      templateKey === "provider_suspended" ||
      templateKey === "provider_profile_rejected"
    ) {
      router.push("/(app)/(tabs)/more/settings/verification");
      return true;
    }

    if (
      templateKey === "provider_onboarding_welcome" ||
      templateKey === "provider_profile_approved" ||
      templateKey === "identity_verification_approved" ||
      templateKey === "identity_verification_rejected"
    ) {
      router.push("/(app)/(tabs)/more/settings/verification");
      return true;
    }

    if (PROVIDER_CUSTOM_REQUEST_TEMPLATE_KEYS.has(templateKey)) {
      const requestId =
        String(data.request_id ?? data.custom_request_id ?? "").trim() ||
        getLinkParam(actionUrl, "request_id") ||
        getLinkParam(actionUrl, "request");
      if (requestId) {
        router.push(`/(app)/(tabs)/more/custom-requests/${requestId}` as never);
      } else {
        router.push("/(app)/(tabs)/more/custom-requests" as never);
      }
      return true;
    }

    if (PROVIDER_BOOKING_TEMPLATE_KEYS.has(templateKey)) {
      if (bookingId) {
        router.push({ pathname: "/(app)/(tabs)/bookings/[id]", params: { id: bookingId } });
      } else {
        router.push("/(app)/(tabs)/bookings");
      }
      return true;
    }

    if (!type && bookingId) {
      router.push({ pathname: "/(app)/(tabs)/bookings/[id]", params: { id: bookingId } });
      return true;
    }

    switch (type) {
      case "on_demand_incoming":
        if (onDemandRequestId) {
          router.push({
            pathname: "/(app)/on-demand/incoming/[id]",
            params: { id: onDemandRequestId },
          });
        } else {
          router.push("/(app)/(tabs)/bookings");
        }
        return true;
      case "on_demand_expired":
      case "on_demand_cancelled":
        if (bookingId) {
          router.push({ pathname: "/(app)/(tabs)/bookings/[id]", params: { id: bookingId } });
        } else {
          router.push("/(app)/(tabs)/bookings");
        }
        return true;
      case "new_booking":
      case "booking_confirmed":
      case "booking_cancelled":
      case "booking_updated":
      case "booking_rescheduled":
      case "booking_reminder":
      case "booking_completed":
        if (bookingId || genericId) {
          router.push({
            pathname: "/(app)/(tabs)/bookings/[id]",
            params: { id: bookingId || genericId },
          });
        } else {
          router.push("/(app)/(tabs)/bookings");
        }
        return true;
      case "new_client":
      case "client_note":
        if (clientId || genericId) {
          router.push({
            pathname: "/(app)/(tabs)/clients/[id]",
            params: { id: clientId || genericId },
          });
        } else {
          router.push("/(app)/(tabs)/bookings");
        }
        return true;
      case "new_message":
      case "chat_message":
        if (
          conversationId ||
          getLinkParam(actionUrl, "conversation") ||
          getLinkParam(actionUrl, "conversation_id")
        ) {
          const cid =
            conversationId ||
            getLinkParam(actionUrl, "conversation") ||
            getLinkParam(actionUrl, "conversation_id");
          router.push({ pathname: "/(app)/(tabs)/chats/[id]", params: { id: cid } });
        } else {
          router.push("/(app)/(tabs)/chats");
        }
        return true;
      case "new_review":
      case "review_response":
        if (bookingId) {
          router.push({ pathname: "/(app)/(tabs)/bookings/[id]", params: { id: bookingId } });
        } else {
          router.push("/(app)/(tabs)/more/reviews");
        }
        return true;
      case "staff_schedule_change":
      case "team_update":
        router.push("/(app)/(tabs)/more/team");
        return true;
      case "staff_invitation": {
        const token =
          getLinkParam(actionUrl, "token") ||
          (typeof data?.invitation_token === "string" ? data.invitation_token : null);
        if (token) {
          router.push(`/join?token=${encodeURIComponent(token)}` as never);
        } else {
          router.push("/join" as never);
        }
        return true;
      }
      case "custom_order_paid":
        if (bookingId) {
          router.push({ pathname: "/(app)/(tabs)/bookings/[id]", params: { id: bookingId } });
        } else {
          router.push("/(app)/(tabs)/more" as never);
        }
        return true;
      case "payout_completed":
      case "payout_sent":
      case "payment_received":
      case "payment_failed":
        router.push("/(app)/(tabs)/more" as never);
        return true;
      case "waitlist_update":
        router.push("/(app)/(tabs)/more/waitlist");
        return true;
      case "product_order_update":
      case "product_order_placed":
        if (productOrderId) {
          router.push(
            `/(app)/(tabs)/more/orders-hub?order=${encodeURIComponent(productOrderId)}` as never,
          );
        } else {
          router.push("/(app)/(tabs)/more/orders-hub" as never);
        }
        return true;
      case "paystack_terminal_payment":
      case "provider_paystack_terminal_payment":
        router.push("/(app)/(tabs)/more/paystack-terminal" as never);
        return true;
      case "product_return_requested":
        router.push("/(app)/(tabs)/more/orders-hub?tab=returns" as never);
        return true;
      case "subscription_expiring":
      case "subscription_renewed":
        router.push("/(app)/(tabs)/more/subscription");
        return true;
      case "provider_custom_offer_declined":
      case "provider_custom_offer_changes_requested":
      case "provider_custom_request_expired":
      case "custom_request":
      case "custom_offer": {
        const requestId =
          String(data.request_id ?? data.custom_request_id ?? "").trim() ||
          getLinkParam(actionUrl, "request_id") ||
          getLinkParam(actionUrl, "request");
        if (requestId) {
          router.push(`/(app)/(tabs)/more/custom-requests/${requestId}` as never);
        } else {
          router.push("/(app)/(tabs)/more/custom-requests" as never);
        }
        return true;
      }
      default:
        return false;
    }
  } catch (err) {
    captureError(err, { scope: "push_notifications:route", payload: data });
    return false;
  }
}
