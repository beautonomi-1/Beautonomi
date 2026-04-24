/**
 * Provides unread notification count for the bell badge and a refetch callback
 * so the notifications screen can invalidate after marking read.
 * Subscribes to notifications table changes so the badge updates in real time.
 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { useAuth } from "@/providers/AuthProvider";
import { api } from "@/lib/api-client";
import { supabase } from "@/lib/supabase/client";

type NotificationsContextValue = {
  unreadCount: number;
  refetchUnreadCount: () => Promise<void>;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const refetchRef = useRef<() => Promise<void>>(() => Promise.resolve());

  const refetchUnreadCount = useCallback(async () => {
    if (!user?.id) {
      setUnreadCount(0);
      return;
    }
    try {
      const res = await api.get<{ total_unread?: number; data?: { total_unread?: number } }>(
        "/api/me/notifications?limit=1"
      );
      const body = res.data as any;
      const count = body?.total_unread ?? body?.data?.total_unread ?? 0;
      setUnreadCount(typeof count === "number" ? count : 0);
    } catch {
      setUnreadCount(0);
    }
  }, [user?.id]);

  refetchRef.current = refetchUnreadCount;

  useEffect(() => {
    refetchUnreadCount();
  }, [refetchUnreadCount]);

  // Home-screen icon badge (iOS / supported Android launchers) — stays in sync with in-app unread count.
  useEffect(() => {
    if (Platform.OS === "web") return;
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
  }, [unreadCount]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`notifications-count:user:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => {
          refetchRef.current();
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

  const value: NotificationsContextValue = {
    unreadCount,
    refetchUnreadCount,
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
    };
  }
  return ctx;
}
