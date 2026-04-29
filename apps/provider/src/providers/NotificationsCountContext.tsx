/**
 * Notifications count for the header badge.
 * Shared so the notifications screen can trigger a refresh after mark read/delete.
 * Subscribes to notifications table changes so the badge updates in real time.
 */
import { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Platform } from "react-native";
import { useApi } from "@/hooks/useApi";
import { useAuth } from "@/providers/AuthProvider";
import { supabase } from "@/lib/supabase/client";

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
    if (!user?.id) return;
    const channel = supabase
      .channel(`notifications-count:user:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => {
          refreshRef.current();
        }
      )
      .subscribe();
    return () => {
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
