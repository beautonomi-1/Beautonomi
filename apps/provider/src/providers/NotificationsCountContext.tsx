/**
 * Notifications count for the header badge.
 * Unified WhatsApp-style total = in-app notifications + unread chat messages.
 */
import { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState, DeviceEventEmitter, InteractionManager, Platform } from "react-native";
import {
  CHAT_BADGE_REFRESH_EVENT,
  NOTIFICATION_BADGE_REFRESH_EVENT,
} from "@/lib/notification-badge-events";
import { syncOsBadgeCount } from "@/lib/sync-os-badge-count";
import { computeUnifiedUnread } from "@/lib/unified-unread-badge";
import { useApi } from "@/hooks/useApi";
import { useAuth } from "@/providers/AuthProvider";
import { supabase } from "@/lib/supabase/client";
import { nextRealtimeTopic } from "@/lib/supabase/realtime-topic";
import { useProvider } from "@/providers/ProviderContext";
import { isProviderApiRole } from "@/lib/provider-api-readiness";

interface NotificationsCountResponse {
  notifications: unknown[];
  total_unread: number;
}

interface ProviderNavCounts {
  pending_bookings?: number;
  active_product_orders?: number;
  unread_messages?: number;
  waiting_room?: number;
  open_return_requests?: number;
  critical_total?: number;
}

interface NotificationsCountContextValue {
  /** In-app notification rows unread (not including chat). */
  notificationUnread: number;
  /** Unread chat messages. */
  chatUnreadCount: number;
  /** Unified total for bell + OS badge. */
  totalUnread: number;
  /** Full nav-counts payload (bookings, orders, etc.) — single fetch for tab badges. */
  navCounts: ProviderNavCounts | null;
  refresh: () => Promise<void>;
  refreshNavCounts: () => Promise<void>;
  adjustUnreadCount: (delta: number) => void;
  replaceUnreadCount: (count: number) => void;
  /** Drop optimistic notification deltas — use after mark-all-read before refetch. */
  resetNotificationUnreadBias: () => void;
  adjustChatUnreadCount: (delta: number) => void;
}

const NotificationsCountContext = createContext<NotificationsCountContextValue | null>(null);

const FOREGROUND_REFETCH_DELAY_MS = 220;
const REALTIME_REFETCH_DEBOUNCE_MS = 120;

export function NotificationsCountProvider({ children }: { children: ReactNode }) {
  const { session, user } = useAuth();
  const { provider, role } = useProvider();
  // Both endpoints are role-gated and 403 for the entire onboarding wizard, so
  // gating on the session alone made every onboarding user poll them forever.
  // A loaded provider profile also proves authorization, which covers the
  // `provider_onboarding` role that the server accepts for provider routes.
  const countsEnabled = !!session && (isProviderApiRole(role) || !!provider?.id);
  const { data, refresh } = useApi<NotificationsCountResponse>(
    "/api/provider/notifications?counts_only=1",
    {
      enabled: countsEnabled,
      staleTimeMs: 0,
    },
  );
  const { data: navCounts, refresh: refreshNavCounts } = useApi<ProviderNavCounts>(
    "/api/provider/nav-counts",
    {
      enabled: countsEnabled,
      staleTimeMs: 15_000,
    },
  );

  const [countBias, setCountBias] = useState(0);
  const [chatBias, setChatBias] = useState(0);
  const [serverSynced, setServerSynced] = useState(false);
  const [chatServerSynced, setChatServerSynced] = useState(false);

  useEffect(() => {
    setCountBias(0);
  }, [data?.total_unread]);

  useEffect(() => {
    setChatBias(0);
  }, [navCounts?.unread_messages]);

  const lastUserIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (lastUserIdRef.current !== undefined && lastUserIdRef.current !== (user?.id ?? null)) {
      setCountBias(0);
      setChatBias(0);
      setServerSynced(false);
      setChatServerSynced(false);
    }
    lastUserIdRef.current = user?.id ?? null;
  }, [user?.id]);

  useEffect(() => {
    if (typeof data?.total_unread === "number") setServerSynced(true);
  }, [data?.total_unread]);

  useEffect(() => {
    if (typeof navCounts?.unread_messages === "number") setChatServerSynced(true);
  }, [navCounts?.unread_messages]);

  const baseUnread = data?.total_unread ?? 0;
  const baseChatUnread = navCounts?.unread_messages ?? 0;
  const notificationUnread = Math.max(0, baseUnread + countBias);
  const chatUnreadCount = Math.max(0, baseChatUnread + chatBias);
  const totalUnread = useMemo(
    () => computeUnifiedUnread(notificationUnread, chatUnreadCount),
    [notificationUnread, chatUnreadCount],
  );
  const badgeReady = serverSynced || chatServerSynced;

  const adjustUnreadCount = useCallback((delta: number) => {
    setCountBias((b) => b + delta);
  }, []);

  const replaceUnreadCount = useCallback(
    (target: number) => {
      setCountBias(target - baseUnread);
    },
    [baseUnread],
  );

  const resetNotificationUnreadBias = useCallback(() => {
    setCountBias(0);
  }, []);

  const adjustChatUnreadCount = useCallback((delta: number) => {
    setChatBias((b) => b + delta);
  }, []);

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const refreshNavRef = useRef(refreshNavCounts);
  refreshNavRef.current = refreshNavCounts;
  // Read inside listeners/timers so they never re-subscribe just because
  // readiness flipped, and never fire a request that can only 403.
  const countsEnabledRef = useRef(countsEnabled);
  countsEnabledRef.current = countsEnabled;

  const refreshAll = useCallback(async () => {
    if (!countsEnabledRef.current) return;
    await Promise.all([refreshRef.current(), refreshNavRef.current()]);
  }, []);

  const refreshCount = useCallback(async () => {
    await refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const sub = DeviceEventEmitter.addListener(NOTIFICATION_BADGE_REFRESH_EVENT, () => {
      if (!countsEnabledRef.current) return;
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        debounce = undefined;
        void refreshRef.current();
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
      if (!countsEnabledRef.current) return;
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        debounce = undefined;
        void refreshNavRef.current();
      }, REALTIME_REFETCH_DEBOUNCE_MS);
    });
    return () => {
      sub.remove();
      if (debounce) clearTimeout(debounce);
    };
  }, []);

  const foregroundTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next !== "active") return;
      if (foregroundTimerRef.current) clearTimeout(foregroundTimerRef.current);
      foregroundTimerRef.current = setTimeout(() => {
        foregroundTimerRef.current = null;
        InteractionManager.runAfterInteractions(() => {
          void refreshAll();
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
  }, [refreshAll]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    if (!session || !badgeReady) return;
    let cancelled = false;
    void (async () => {
      if (cancelled) return;
      await syncOsBadgeCount(totalUnread);
    })();
    return () => {
      cancelled = true;
    };
  }, [totalUnread, badgeReady, session]);

  // Safety net when Supabase realtime disconnects.
  useEffect(() => {
    if (!countsEnabled) return;
    const interval = setInterval(() => {
      void refreshAll();
    }, 60_000);
    return () => clearInterval(interval);
  }, [countsEnabled, refreshAll]);

  useEffect(() => {
    if (!user?.id) return;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    try {
      const topic = nextRealtimeTopic(`notifications-count:user:${user.id}`);
      channel = supabase
        .channel(topic)
        .on(
          "postgres_changes" as never,
          { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
          () => {
            if (debounce) clearTimeout(debounce);
            debounce = setTimeout(() => {
              void refreshRef.current();
            }, REALTIME_REFETCH_DEBOUNCE_MS);
          },
        )
        .subscribe();
    } catch {
      // Non-fatal: badge still refreshes on focus / interval.
    }

    return () => {
      if (debounce) clearTimeout(debounce);
      if (!channel) return;
      try {
        supabase.removeChannel(channel);
      } catch {
        // ignore
      }
    };
  }, [user?.id]);

  useEffect(() => {
    const providerId = provider?.id;
    if (!providerId) return;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    try {
      const topic = nextRealtimeTopic(`provider-chat-unread:${providerId}`);
      channel = supabase
        .channel(topic)
        .on(
          "postgres_changes" as never,
          { event: "*", schema: "public", table: "conversations", filter: `provider_id=eq.${providerId}` },
          () => {
            if (debounce) clearTimeout(debounce);
            debounce = setTimeout(() => {
              void refreshNavRef.current();
            }, REALTIME_REFETCH_DEBOUNCE_MS);
          },
        )
        .subscribe();
    } catch {
      // Non-fatal
    }

    return () => {
      if (debounce) clearTimeout(debounce);
      if (!channel) return;
      try {
        supabase.removeChannel(channel);
      } catch {
        // ignore
      }
    };
  }, [provider?.id]);

  const contextValue = useMemo<NotificationsCountContextValue>(
    () => ({
      notificationUnread,
      chatUnreadCount,
      totalUnread,
      navCounts: navCounts ?? null,
      refresh: refreshCount,
      refreshNavCounts,
      adjustUnreadCount,
      replaceUnreadCount,
      resetNotificationUnreadBias,
      adjustChatUnreadCount,
    }),
    [
      notificationUnread,
      chatUnreadCount,
      totalUnread,
      navCounts,
      refreshCount,
      refreshNavCounts,
      adjustUnreadCount,
      replaceUnreadCount,
      resetNotificationUnreadBias,
      adjustChatUnreadCount,
    ],
  );

  return (
    <NotificationsCountContext.Provider value={contextValue}>
      {children}
    </NotificationsCountContext.Provider>
  );
}

export function useNotificationsCount(): NotificationsCountContextValue {
  const ctx = useContext(NotificationsCountContext);
  if (!ctx) {
    return {
      notificationUnread: 0,
      chatUnreadCount: 0,
      totalUnread: 0,
      navCounts: null,
      refresh: async () => {},
      refreshNavCounts: async () => {},
      adjustUnreadCount: () => {},
      replaceUnreadCount: () => {},
      resetNotificationUnreadBias: () => {},
      adjustChatUnreadCount: () => {},
    };
  }
  return ctx;
}
