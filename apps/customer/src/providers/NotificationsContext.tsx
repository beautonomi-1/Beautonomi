/**
 * Provides unread notification count for the bell badge and a refetch callback
 * so the notifications screen can invalidate after marking read.
 * Subscribes to notifications table changes so the badge updates in real time.
 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState, DeviceEventEmitter, InteractionManager, Platform } from "react-native";
import {
  NOTIFICATION_BADGE_REFRESH_EVENT,
} from "@/lib/notification-badge-events";
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

type NotificationsContextValue = {
  unreadCount: number;
  refetchUnreadCount: () => Promise<void>;
  /** Immediate badge change while mark-read/delete requests run or realtime catches up. */
  adjustUnreadCount: (delta: number) => void;
  replaceUnreadCount: (count: number) => void;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

/** Badge poll uses `counts_only=1` (one DB head query) instead of list+count — see GET /api/me/notifications. */
const BADGE_COUNT_URL = "/api/me/notifications?counts_only=1" as const;

/** Stagger after foreground so Amplitude / OneSignal / auth work on the same tick does not stack with badge fetch (Sentry: App hanging). */
const FOREGROUND_REFETCH_DELAY_MS = 220;

/** Coalesce postgres_changes bursts (same pattern as provider NotificationsCountContext). */
const REALTIME_REFETCH_DEBOUNCE_MS = 120;

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  /** True once the server has returned a count. Until then we must not overwrite
   * an OS badge that a push set while the app was killed. */
  const [serverSynced, setServerSynced] = useState(false);
  const refetchRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const foregroundTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const realtimeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      setUnreadCount(typeof count === "number" ? count : 0);
      setServerSynced(true);
    } catch {
      // Leave the existing count/badge alone on failure; do not clobber a
      // push-set badge with 0 just because a refresh failed.
    }
  }, [user?.id]);

  const adjustUnreadCount = useCallback((delta: number) => {
    setUnreadCount((c) => Math.max(0, c + delta));
  }, []);

  const replaceUnreadCount = useCallback((count: number) => {
    setUnreadCount(Math.max(0, Math.floor(count)));
  }, []);

  refetchRef.current = refetchUnreadCount;

  useEffect(() => {
    refetchUnreadCount();
  }, [refetchUnreadCount]);

  useEffect(() => {
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const sub = DeviceEventEmitter.addListener(NOTIFICATION_BADGE_REFRESH_EVENT, () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        debounce = undefined;
        void refetchRef.current();
      }, REALTIME_REFETCH_DEBOUNCE_MS);
    });
    return () => {
      sub.remove();
      if (debounce) clearTimeout(debounce);
    };
  }, []);

  // Refresh unread when app returns to foreground — delayed + after interactions so we do not
  // contend with other SDKs on the same "active" tick (battery + low-memory devices showed hangs).
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next !== "active") return;
      if (foregroundTimerRef.current) clearTimeout(foregroundTimerRef.current);
      foregroundTimerRef.current = setTimeout(() => {
        foregroundTimerRef.current = null;
        InteractionManager.runAfterInteractions(() => {
          void refetchUnreadCount();
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
  }, [refetchUnreadCount]);

  // Home-screen icon badge (iOS / supported Android launchers) — stays in sync with in-app unread count.
  useEffect(() => {
    if (Platform.OS === "web") return;
    // Wait for the first server count before touching the OS badge — otherwise
    // a cold start would briefly set it to 0 and wipe a push-delivered badge.
    if (!serverSynced) return;
    let cancelled = false;
    (async () => {
      try {
        const Notifications = await import("expo-notifications");
        if (cancelled) return;
        const n = Math.min(999_999, Math.max(0, Math.floor(unreadCount)));
        await Notifications.setBadgeCountAsync(n);
      } catch {
        // Dev client without native rebuild, or launcher without badge support
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [unreadCount, serverSynced]);

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
            void refetchRef.current();
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

  const value: NotificationsContextValue = {
    unreadCount,
    refetchUnreadCount,
    adjustUnreadCount,
    replaceUnreadCount,
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
      refetchUnreadCount: async () => {},
      adjustUnreadCount: () => {},
      replaceUnreadCount: () => {},
    };
  }
  return ctx;
}
