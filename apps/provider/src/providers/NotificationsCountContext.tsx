/**
 * Notifications count for the header badge.
 * Shared so the notifications screen can trigger a refresh after mark read/delete.
 */
import { createContext, useContext, useCallback, type ReactNode } from "react";
import { useApi } from "@/hooks/useApi";
import { useAuth } from "@/providers/AuthProvider";

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
  const { session } = useAuth();
  const { data, refresh } = useApi<NotificationsCountResponse>("/api/provider/notifications?limit=1", {
    enabled: !!session,
  });
  const totalUnread = data?.total_unread ?? 0;
  const refreshCount = useCallback(async () => {
    await refresh();
  }, [refresh]);

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
