/**
 * Invisible component that bridges the notifications realtime channel to the
 * InAppBannerProvider. Mount once inside the authenticated app tree.
 *
 * Two event sources feed banners, deduped against each other:
 *  - notifications INSERT rows (booking, payment, message, offer, etc.). The
 *    backend inserts a `new_message` notifications row for chat, so messages
 *    normally arrive here.
 *  - conversations unread increase (fallback for chat if the notifications row
 *    insert was skipped, e.g. a push send threw before insertNotification).
 *
 * Message events from both sources share a `msg:<conversationId>` dedupe key so
 * exactly one banner shows per incoming message.
 *
 * Rules:
 *  - Only fires while AppState === "active".
 *  - Suppresses message banners when already in that chat thread.
 *  - Suppresses booking banners when already on that booking-detail.
 */
import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import type { AppStateStatus } from "react-native";
import {
  registerNotificationsRealtimeCallback,
  registerConversationUnreadCallback,
  type NewNotificationRow,
  type ConversationUnreadEvent,
} from "@/providers/NotificationsContext";
import { useInAppBanner, type InAppBannerTone } from "@/providers/InAppBannerProvider";
import { iconNameForNotificationType, navigateFromNotification } from "@/lib/notifications";
import type { Notification } from "@/lib/notifications";
import { haptic } from "@/lib/haptics";
import {
  getActiveChatConversationId,
  getActiveBookingId,
} from "@/lib/active-screen-context";

/** Notification types that warrant stronger haptic feedback. */
const HIGH_URGENCY_TYPES = new Set([
  "provider_arrived",
  "provider_on_way",
  "waitlist_available",
  "additional_charge_requested",
]);

/** Dedupe windows. Message window bridges the ordering gap between the
 * conversations UPDATE (message-insert trigger) and the notifications INSERT. */
const MESSAGE_DEDUPE_MS = 8_000;
const NOTIF_DEDUPE_MS = 30_000;

function isMessageType(type: string): boolean {
  const t = (type ?? "").toLowerCase();
  return t.includes("message") || t.includes("chat");
}

function toneForType(type: string): InAppBannerTone {
  const t = (type ?? "").toLowerCase();
  if (t.includes("cancel") || t.includes("decline") || t.includes("failed") || t.includes("rejected")) return "warning";
  if (
    t.includes("confirmed") ||
    t.includes("completed") ||
    t.includes("success") ||
    t.includes("accepted") ||
    t.includes("approved") ||
    t.includes("refund")
  )
    return "success";
  if (t.includes("arrived") || t.includes("on_way") || t.includes("waitlist")) return "info";
  return "default";
}

/** Converts a raw DB notification row to the `Notification` shape expected by navigateFromNotification. */
function rowToNotification(row: NewNotificationRow): Notification {
  return {
    id: row.id ?? "",
    type: row.type ?? "",
    title: row.title ?? "",
    message: row.message ?? "",
    is_read: row.is_read ?? false,
    created_at: row.created_at ?? new Date().toISOString(),
    data: (row.data as Notification["data"]) ?? {},
    link: row.link,
    action_url: row.action_url,
  };
}

export function NotificationBannerListener() {
  const banner = useInAppBanner();
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  /** Shared dedupe registry keyed by `notif:<id>` or `msg:<conversationId>`. */
  const shownKeys = useRef<Set<string>>(new Set());

  /** Returns true if the key was already shown (within its TTL); otherwise marks it. */
  const markShown = useRef((key: string, ttlMs: number): boolean => {
    if (shownKeys.current.has(key)) return true;
    shownKeys.current.add(key);
    setTimeout(() => shownKeys.current.delete(key), ttlMs);
    return false;
  }).current;

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    function handleNotificationRow(row?: NewNotificationRow) {
      if (appStateRef.current !== "active") return;
      if (!row) return;

      const type = (row.type ?? "").toLowerCase();
      const data = (row.data ?? {}) as Record<string, unknown>;
      const conversationId = data.conversation_id != null ? String(data.conversation_id) : "";
      const isMessage = isMessageType(type);

      // Suppress message banner if already in that conversation.
      if (isMessage && conversationId && getActiveChatConversationId() === conversationId) {
        return;
      }

      // Suppress booking banner if already on that booking-detail.
      const bookingId =
        data.booking_id != null
          ? String(data.booking_id)
          : (data as { bookingId?: unknown }).bookingId != null
            ? String((data as { bookingId?: unknown }).bookingId)
            : "";
      if (bookingId && getActiveBookingId() === bookingId) return;

      // Dedupe: messages share a conversation-scoped key with the unread path;
      // everything else dedupes on its notification id.
      const dedupeKey =
        isMessage && conversationId ? `msg:${conversationId}` : row.id ? `notif:${row.id}` : "";
      const ttl = isMessage && conversationId ? MESSAGE_DEDUPE_MS : NOTIF_DEDUPE_MS;
      if (dedupeKey && markShown(dedupeKey, ttl)) return;

      const notification = rowToNotification(row);
      const iconName = iconNameForNotificationType(type) as Parameters<typeof banner.show>[0]["icon"];
      const tone = toneForType(type);

      if (HIGH_URGENCY_TYPES.has(type)) {
        haptic.warning();
      } else if (tone === "success") {
        haptic.success();
      } else {
        haptic.light();
      }

      banner.show({
        id: row.id,
        icon: iconName,
        title: row.title ?? "Notification",
        message: row.message,
        tone,
        onPress: () => navigateFromNotification(notification),
      });
    }

    return registerNotificationsRealtimeCallback(handleNotificationRow);
  }, [banner, markShown]);

  useEffect(() => {
    function handleConversationUnread(event: ConversationUnreadEvent) {
      if (appStateRef.current !== "active") return;

      // Suppress if already in this conversation.
      if (getActiveChatConversationId() === event.conversation_id) return;

      // Shared dedupe with the notifications `new_message` path.
      if (markShown(`msg:${event.conversation_id}`, MESSAGE_DEDUPE_MS)) return;

      haptic.light();
      banner.show({
        id: `conv:${event.conversation_id}`,
        icon: "chatbubble-ellipses-outline",
        title: "New message",
        message: event.last_message_preview,
        tone: "default",
        onPress: () => {
          navigateFromNotification({
            id: `conv:${event.conversation_id}`,
            type: "new_message",
            title: "New message",
            message: event.last_message_preview ?? "",
            is_read: false,
            created_at: new Date().toISOString(),
            data: { conversation_id: event.conversation_id },
          });
        },
      });
    }

    return registerConversationUnreadCallback(handleConversationUnread);
  }, [banner, markShown]);

  return null;
}
