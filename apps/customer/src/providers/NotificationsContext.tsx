/**
 * Provides unread notification + chat counts for bell/tab badges and OS icon badge.
 * Subscribes to notifications and conversations table changes for live updates.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState, DeviceEventEmitter, InteractionManager, Platform } from "react-native";
import {
  CHAT_BADGE_REFRESH_EVENT,
  NOTIFICATION_BADGE_REFRESH_EVENT,
} from "@/lib/notification-badge-events";
import { syncOsBadgeCount } from "@/lib/sync-os-badge-count";
import { computeUnifiedUnread } from "@/lib/unified-unread-badge";
import { useAuth } from "@/providers/AuthProvider";
import { api } from "@/lib/api-client";
import { supabase } from "@/lib/supabase/client";
import { nextRealtimeTopic } from "@/lib/supabase/realtime-topic";

/** Extra callbacks when `notifications` rows change — avoids a second postgres_changes channel (Supabase rejects duplicate bindings after subscribe). */
const notificationsRealtimeListeners = new Set<() => void>();

export function registerNotificationsRealtimeCallback(fn: () => void): () => void {
  notificationsRealtimeListeners.add(fn);
  return () => {
    notificationsRealtimeListeners.delete(fn);
  };
}

function notifyNotificationsRealtimeListeners() {
  notificationsRealtimeListeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // ignore listener errors
    }
  });
}

type ConversationUnreadRow = { unread_count_customer?: number };

function sumCustomerChatUnread(rows: ConversationUnreadRow[]): number {
  return rows.reduce((sum, item) => sum + Math.max(0, item.unread_count_customer ?? 0), 0);
}

type NotificationsContextValue = {
  /** In-app notification rows unread (not including chat). */
  unreadCount: number;
  /** Unread chat messages across conversations. */
  chatUnreadCount: number;
  /** WhatsApp-style unified total for bell + OS badge. */
  totalUnread: number;
  refetchUnreadCount: () => Promise<void>;
  refetchChatUnreadCount: () => Promise<void>;
  /** Immediate badge change while mark-read/delete requests run or realtime catches up. */
  adjustUnreadCount: (delta: number) => void;
  replaceUnreadCount: (count: number) => void;
  adjustChatUnreadCount: (delta: number) => void;
  replaceChatUnreadCount: (count: number) => void;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

/** Badge poll uses `counts_only=1` (one DB head query) instead of list+count — see GET /api/me/notifications. */
const BADGE_COUNT_URL = "/api/me/notifications?counts_only=1" as const;
const CONVERSATIONS_URL = "/api/me/conversations" as const;

/** Stagger after foreground so Amplitude / OneSignal / auth work on the same tick does not stack with badge fetch (Sentry: App hanging). */
const FOREGROUND_REFETCH_DELAY_MS = 220;

/** Coalesce postgres_changes bursts (same pattern as provider NotificationsCountContext). */
const REALTIME_REFETCH_DEBOUNCE_MS = 120;

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  /** True once the server has returned a count. Until then we must not overwrite
   * an OS badge that a push set while the app was killed. */
  const [serverSynced, setServerSynced] = useState(false);
  const [chatServerSynced, setChatServerSynced] = useState(false);
  const refetchNotificationsRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const refetchChatRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const foregroundTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const realtimeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatRealtimeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastGoodNotifRef = useRef(0);
  const lastGoodChatRef = useRef(0);

  const refetchUnreadCount = useCallback(async () => {
    if (!user?.id) {
      setUnreadCount(0);
      return;
    }
    try {
      const res = await api.get<{ total_unread?: number; data?: { total_unread?: number } }>(
        BADGE_COUNT_URL
      );
      const body = res.data as any;
      const count = body?.total_unread ?? body?.data?.total_unread ?? 0;
      const next = typeof count === "number" ? count : 0;
      setUnreadCount(next);
      lastGoodNotifRef.current = next;
      setServerSynced(true);
    } catch {
      // Keep last known good; badge sync still uses lastGoodNotifRef.
    }
  }, [user?.id]);

  const refetchChatUnreadCount = useCallback(async () => {
    if (!user?.id) {
      setChatUnreadCount(0);
      return;
    }
    try {
      const res = await api.get<ConversationUnreadRow[] | { data?: ConversationUnreadRow[] }>(
        CONVERSATIONS_URL
      );
      const raw = res.data;
      const conversations = Array.isArray(raw) ? raw : raw?.data ?? [];
      const next = sumCustomerChatUnread(conversations);
      setChatUnreadCount(next);
      lastGoodChatRef.current = next;
      setChatServerSynced(true);
    } catch {
      // Keep last known good; badge sync still uses lastGoodChatRef.
    }
  }, [user?.id]);

  const refetchAll = useCallback(async () => {
    await Promise.all([refetchUnreadCount(), refetchChatUnreadCount()]);
  }, [refetchUnreadCount, refetchChatUnreadCount]);

  const adjustUnreadCount = useCallback((delta: number) => {
    setUnreadCount((c) => Math.max(0, c + delta));
  }, []);

  const replaceUnreadCount = useCallback((count: number) => {
    const next = Math.max(0, Math.floor(count));
    setUnreadCount(next);
    lastGoodNotifRef.current = next;
  }, []);

  const adjustChatUnreadCount = useCallback((delta: number) => {
    setChatUnreadCount((c) => Math.max(0, c + delta));
  }, []);

  const replaceChatUnreadCount = useCallback((count: number) => {
    setChatUnreadCount(Math.max(0, Math.floor(count)));
  }, []);

  const totalUnread = useMemo(
    () => computeUnifiedUnread(unreadCount, chatUnreadCount),
    [unreadCount, chatUnreadCount],
  );

  refetchNotificationsRef.current = refetchUnreadCount;
  refetchChatRef.current = refetchChatUnreadCount;

  // Reset counts + server-sync flags the instant the authenticated user changes.
  const lastUserIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (lastUserIdRef.current !== undefined && lastUserIdRef.current !== (user?.id ?? null)) {
      setUnreadCount(0);
      setChatUnreadCount(0);
      setServerSynced(false);
      setChatServerSynced(false);
    }
    lastUserIdRef.current = user?.id ?? null;
  }, [user?.id]);

  useEffect(() => {
    void refetchAll();
  }, [refetchAll]);

  useEffect(() => {
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const sub = DeviceEventEmitter.addListener(NOTIFICATION_BADGE_REFRESH_EVENT, () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        debounce = undefined;
        void refetchNotificationsRef.current();
      }, REALTIME_REFETCH_DEBOUNCE_MS);
    });
    return () => {
      sub.remove();
      if (debounce) clearTimeout(debounce);
    };
  }, []);

  useEffect(() => {
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const sub = DeviceEventEmitter.addListener(CHAT_BADGE_REFRESH_EVENT, () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        debounce = undefined;
        void refetchChatRef.current();
      }, REALTIME_REFETCH_DEBOUNCE_MS);
    });
    return () => {
      sub.remove();
      if (debounce) clearTimeout(debounce);
    };
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next !== "active") return;
      if (foregroundTimerRef.current) clearTimeout(foregroundTimerRef.current);
      foregroundTimerRef.current = setTimeout(() => {
        foregroundTimerRef.current = null;
        InteractionManager.runAfterInteractions(() => {
          void refetchAll();
        });
      }, FOREGROUND_REFETCH_DELAY_MS);
    });
    return () => {
      sub.remove();
      if (foregroundTimerRef.current) {
        clearTimeout(foregroundTimerRef.current);
        foregroundTimerRef.current = null;
      }
    };
  }, [refetchAll]);

  const badgeReady = serverSynced || chatServerSynced;

  const osBadgeTotal = useMemo(
    () =>
      computeUnifiedUnread(
        serverSynced ? unreadCount : lastGoodNotifRef.current,
        chatServerSynced ? chatUnreadCount : lastGoodChatRef.current,
      ),
    [serverSynced, chatServerSynced, unreadCount, chatUnreadCount],
  );

  useEffect(() => {
    if (Platform.OS === "web") return;
    if (!user?.id || !badgeReady) return;
    let cancelled = false;
    void (async () => {
      if (cancelled) return;
      await syncOsBadgeCount(osBadgeTotal);
    })();
    return () => {
      cancelled = true;
    };
  }, [osBadgeTotal, badgeReady, user?.id]);

  // Safety net when Supabase realtime disconnects — poll counts periodically.
  useEffect(() => {
    if (!user?.id) return;
    const interval = setInterval(() => {
      void refetchAll();
    }, 60_000);
    return () => clearInterval(interval);
  }, [user?.id, refetchAll]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(nextRealtimeTopic(`notifications-count:user:${user.id}`))
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => {
          if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
          realtimeDebounceRef.current = setTimeout(() => {
            realtimeDebounceRef.current = null;
            void refetchNotificationsRef.current();
            notifyNotificationsRealtimeListeners();
          }, REALTIME_REFETCH_DEBOUNCE_MS);
        }
      )
      .subscribe();
    return () => {
      if (realtimeDebounceRef.current) {
        clearTimeout(realtimeDebounceRef.current);
        realtimeDebounceRef.current = null;
      }
      try {
        supabase.removeChannel(channel);
      } catch {
        // ignore
      }
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(nextRealtimeTopic(`chat-unread-count:user:${user.id}`))
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations", filter: `customer_id=eq.${user.id}` },
        () => {
          if (chatRealtimeDebounceRef.current) clearTimeout(chatRealtimeDebounceRef.current);
          chatRealtimeDebounceRef.current = setTimeout(() => {
            chatRealtimeDebounceRef.current = null;
            void refetchChatRef.current();
          }, REALTIME_REFETCH_DEBOUNCE_MS);
        }
      )
      .subscribe();
    return () => {
      if (chatRealtimeDebounceRef.current) {
        clearTimeout(chatRealtimeDebounceRef.current);
        chatRealtimeDebounceRef.current = null;
      }
      try {
        supabase.removeChannel(channel);
      } catch {
        // ignore
      }
    };
  }, [user?.id]);

  const value: NotificationsContextValue = {
    unreadCount,
    chatUnreadCount,
    totalUnread,
    refetchUnreadCount,
    refetchChatUnreadCount,
    adjustUnreadCount,
    replaceUnreadCount,
    adjustChatUnreadCount,
    replaceChatUnreadCount,
  };

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    return {
      unreadCount: 0,
      chatUnreadCount: 0,
      totalUnread: 0,
      refetchUnreadCount: async () => {},
      refetchChatUnreadCount: async () => {},
      adjustUnreadCount: () => {},
      replaceUnreadCount: () => {},
      adjustChatUnreadCount: () => {},
      replaceChatUnreadCount: () => {},
    };
  }
  return ctx;
}
