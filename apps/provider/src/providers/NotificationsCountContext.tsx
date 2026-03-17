/**
 * Notifications count for the header badge.
 * Shared so the notifications screen can trigger a refresh after mark read/delete.
 * Subscribes to notifications table changes so the badge updates in real time.
 */
import { createContext, useContext, useCallback, useEffect, useRef, type ReactNode } from "react";
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
}

const NotificationsCountContext = createContext<NotificationsCountContextValue | null>(null);

export function NotificationsCountProvider({ children }: { children: ReactNode }) {
  const { session, user } = useAuth();
  const { data, refresh } = useApi<NotificationsCountResponse>("/api/provider/notifications?limit=1", {
    enabled: !!session,
  });
  const totalUnread = data?.total_unread ?? 0;
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

  return (
    <NotificationsCountContext.Provider value={{ totalUnread, refresh: refreshCount }}>
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
    };
  }
  return ctx;
}
