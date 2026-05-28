/**
 * Notifications count for the header badge.
 * Shared so the notifications screen can trigger a refresh after mark read/delete.
 * Subscribes to notifications table changes so the badge updates in real time.
 */
import { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState, Platform } from "react-native";
import { useApi } from "@/hooks/useApi";
import { useAuth } from "@/providers/AuthProvider";
import { supabase } from "@/lib/supabase/client";
import { nextRealtimeTopic } from "@/lib/supabase/realtime-topic";

interface NotificationsCountResponse {
  notifications: unknown[];
  total_unread: number;
}

interface NotificationsCountContextValue {
  totalUnread: number;
  refresh: () => Promise<void>;
  adjustUnreadCount: (delta: number) => void;
  replaceUnreadCount: (count: number) => void;
}

const NotificationsCountContext = createContext<NotificationsCountContextValue | null>(null);

export function NotificationsCountProvider({ children }: { children: ReactNode }) {
  const { session, user } = useAuth();
  const { data, refresh } = useApi<NotificationsCountResponse>("/api/provider/notifications?limit=1", {
    enabled: !!session,
    /** Bell badge must track server unread immediately after read/delete (no stale GET cache). */
    staleTimeMs: 0,
  });
  /** Shifts badge immediately; resets when `data.total_unread` changes from the server. */
  const [countBias, setCountBias] = useState(0);
  useEffect(() => {
    setCountBias(0);
  }, [data?.total_unread]);

  const baseUnread = data?.total_unread ?? 0;
  const totalUnread = Math.max(0, baseUnread + countBias);

  const adjustUnreadCount = useCallback((delta: number) => {
    setCountBias((b) => b + delta);
  }, []);

  const replaceUnreadCount = useCallback(
    (target: number) => {
      setCountBias(target - baseUnread);
    },
    [baseUnread],
  );

  useEffect(() => {
    if (Platform.OS === "web") return;
    let cancelled = false;
    (async () => {
      try {
        const Notifications = await import("expo-notifications");
        if (cancelled) return;
        const n = Math.min(999_999, Math.max(0, Math.floor(totalUnread)));
        await Notifications.setBadgeCountAsync(n);
      } catch {
        // Native module unavailable until dev client rebuild
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [totalUnread]);

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const refreshCount = useCallback(async () => {
    await refreshRef.current();
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        // Stagger 200 ms behind the AuthProvider and TabsLayout AppState
        // handlers so all three don't hit the JS thread in the same tick,
        // reducing the risk of ANR on foreground.
        setTimeout(() => void refreshRef.current(), 200);
      }
    });
    return () => sub.remove();
  }, []);

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
            }, 120);
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

  const contextValue = useMemo<NotificationsCountContextValue>(
    () => ({
      totalUnread,
      refresh: refreshCount,
      adjustUnreadCount,
      replaceUnreadCount,
    }),
    [totalUnread, refreshCount, adjustUnreadCount, replaceUnreadCount],
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
      totalUnread: 0,
      refresh: async () => {},
      adjustUnreadCount: () => {},
      replaceUnreadCount: () => {},
    };
  }
  return ctx;
}
