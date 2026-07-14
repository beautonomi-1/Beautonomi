"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/AuthProvider";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  Bell,
  Calendar,
  DollarSign,
  User,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Package,
  Users,
  Settings,
  FileText,
  Zap,
  Trash2,
  ChevronDown,
  ChevronUp,
  MailOpen,
} from "lucide-react";
import { PageHeader } from "@/components/provider/PageHeader";
import { SectionCard } from "@/components/provider/SectionCard";
import { Button } from "@/components/ui/button";
import { fetcher, deleteFetcherGetCacheEntriesMatching } from "@/lib/http/fetcher";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { deriveProviderPortalNotificationUrl } from "@/lib/provider/derive-provider-notification-url";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  timestamp: string;
  link?: string;
  priority: "low" | "medium" | "high";
  read: boolean;
  metadata?: Record<string, any>;
  data?: Record<string, any>;
}

function deriveNotificationUrl(notification: Notification): string | undefined {
  return deriveProviderPortalNotificationUrl({
    type: notification.type,
    link: notification.link,
    data: notification.data,
    metadata: notification.metadata,
  });
}

const getNotificationIcon = (type: string) => {
  switch (type) {
    case "appointment_reminder":
    case "appointment_cancelled":
    case "appointment_rescheduled":
    case "new_appointment":
      return Calendar;
    case "payment_received":
    case "payout_processed":
    case "refund_processed":
      return DollarSign;
    case "new_client":
    case "client_message":
      return User;
    case "staff_clock_in":
    case "staff_clock_out":
    case "shift_reminder":
      return Clock;
    case "service_booking":
    case "product_order":
      return Package;
    case "team_member_added":
    case "team_member_updated":
      return Users;
    case "system_update":
    case "maintenance":
      return Settings;
    case "report_ready":
    case "document_ready":
      return FileText;
    case "payment_failed":
    case "subscription_expiring":
      return AlertTriangle;
    case "account_verification":
      return CheckCircle2;
    case "high_priority":
      return Zap;
    default:
      return Bell;
  }
};

const getPriorityColor = (priority: string) => {
  switch (priority) {
    case "high":
      return "text-red-600 bg-red-50 border-red-200";
    case "medium":
      return "text-yellow-600 bg-yellow-50 border-yellow-200";
    default:
      return "text-blue-600 bg-blue-50 border-blue-200";
  }
};

const formatTimeAgo = (timestamp: string) => {
  const now = new Date();
  const time = new Date(timestamp);
  const diffInSeconds = Math.floor((now.getTime() - time.getTime()) / 1000);

  if (diffInSeconds < 60) return "Just now";
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
  return time.toLocaleDateString();
};

const realtimeChannelKey = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

type FilterTab = "all" | "unread";

export function NotificationsClient({
  initialNotifications,
  initialTotalUnread,
  initialError,
  fromServer,
}: {
  initialNotifications: Notification[];
  initialTotalUnread: number;
  initialError: string | null;
  fromServer: boolean;
}) {
  const [notifications, setNotifications] = useState<Notification[]>(() => initialNotifications);
  const [totalUnread, setTotalUnread] = useState(() => initialTotalUnread);
  const [isLoading, setIsLoading] = useState(() => {
    if (initialError) return false;
    return !fromServer;
  });
  const [filter, setFilter] = useState<FilterTab>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    if (initialError) toast.error(initialError);
  }, [initialError]);

  const loadNotifications = useCallback(
    async (options?: { silent?: boolean; staleTimeMs?: number }) => {
      if (!user?.id) return;
      try {
        if (!options?.silent) setIsLoading(true);
        const unreadOnly = filter === "unread";
        const url = unreadOnly
          ? "/api/provider/notifications?limit=100&unread_only=true"
          : "/api/provider/notifications?limit=100";
        const response = await fetcher.get<{ data?: { notifications: Notification[]; total_unread: number } }>(url, {
          staleTimeMs: options?.staleTimeMs,
        });
        const data = response.data ?? response;
        setNotifications((data as any).notifications || []);
        setTotalUnread((data as any).total_unread || 0);
      } catch (error) {
        console.error("Failed to load notifications:", error);
        if (!options?.silent) {
          toast.error("Failed to load notifications");
          setNotifications([]);
          setTotalUnread(0);
        }
      } finally {
        if (!options?.silent) setIsLoading(false);
      }
    },
    [user?.id, filter],
  );

  useEffect(() => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }
    const silent = Boolean(fromServer && filter === "all" && !initialError);
    void loadNotifications(silent ? { silent: true } : undefined);
  }, [user?.id, filter, loadNotifications, fromServer, initialError]);

  useEffect(() => {
    if (!user?.id) return;
    const supabase = getSupabaseClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(`notifications:provider:${user.id}:${realtimeChannelKey()}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
          () => {
            // Bypass the GET cache — the DB just changed, cached data is stale.
            void loadNotifications({ silent: true, staleTimeMs: 0 });
          }
        )
        .subscribe();
    } catch (error) {
      console.warn("Provider notifications realtime subscription failed:", error);
    }
    return () => {
      if (!channel) return;
      try {
        supabase.removeChannel(channel);
      } catch {
        // ignore
      }
    };
  }, [user?.id, loadNotifications]);

  const handleNotificationClick = async (notification: Notification) => {
    const wasUnread = !notification.read;
    const unreadBefore = totalUnread;
    if (wasUnread) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n)),
      );
      setTotalUnread((prev) => Math.max(0, prev - 1));
    }
    if (wasUnread) {
      try {
        await fetcher.post(`/api/provider/notifications/${notification.id}/read`);
        deleteFetcherGetCacheEntriesMatching("/api/provider/notifications");
      } catch (error) {
        console.error("Failed to mark notification as read:", error);
        setNotifications((prev) =>
          prev.map((n) => (n.id === notification.id ? { ...n, read: false } : n)),
        );
        setTotalUnread(unreadBefore);
        toast.error("Could not mark notification as read");
        return;
      }
    }
    const url = deriveNotificationUrl(notification);
    if (url) {
      router.push(url);
    } else {
      setExpandedId((prev) => (prev === notification.id ? null : notification.id));
    }
  };

  const handleDeleteNotification = async (
    e: React.MouseEvent,
    notification: Notification,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    if (
      typeof window !== "undefined" &&
      !window.confirm("Delete this notification? It will be removed from your list.")
    ) {
      return;
    }
    const wasUnread = !notification.read;
    const prevList = notifications;
    const prevUnread = totalUnread;
    setNotifications((prev) => prev.filter((n) => n.id !== notification.id));
    if (wasUnread) {
      setTotalUnread((u) => Math.max(0, u - 1));
    }
    try {
      await fetcher.delete(
        `/api/provider/notifications/${encodeURIComponent(notification.id)}`,
      );
      deleteFetcherGetCacheEntriesMatching("/api/provider/notifications");
      toast.success("Notification deleted");
    } catch (error) {
      console.error("Failed to delete notification:", error);
      setNotifications(prevList);
      setTotalUnread(prevUnread);
      toast.error("Failed to delete notification");
    }
  };

  const handleMarkUnread = async (e: React.MouseEvent, notification: Notification) => {
    e.preventDefault();
    e.stopPropagation();
    if (!notification.read) return;
    const prevUnread = totalUnread;
    setNotifications((prev) =>
      prev.map((n) => (n.id === notification.id ? { ...n, read: false } : n)),
    );
    setTotalUnread((prev) => prev + 1);
    try {
      // Server couples read_at with is_read so all surfaces agree on read state.
      await fetcher.patch(`/api/provider/notifications/${notification.id}`, {
        is_read: false,
      });
      deleteFetcherGetCacheEntriesMatching("/api/provider/notifications");
    } catch (error) {
      console.error("Failed to mark as unread:", error);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n)),
      );
      setTotalUnread(prevUnread);
      toast.error("Failed to mark as unread");
    }
  };

  const handleMarkAllRead = async () => {
    const prevNotifications = notifications;
    const prevUnread = totalUnread;
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setTotalUnread(0);
    try {
      await fetcher.post("/api/provider/notifications/mark-all-read");
      deleteFetcherGetCacheEntriesMatching("/api/provider/notifications");
      toast.success("All notifications marked as read");
    } catch (error) {
      console.error("Failed to mark all as read:", error);
      setNotifications(prevNotifications);
      setTotalUnread(prevUnread);
      toast.error("Failed to mark all as read");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        subtitle="View and manage your notifications"
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Notifications" },
        ]}
      />

      <SectionCard>
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              filter === "all" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setFilter("unread")}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              filter === "unread" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            Unread
          </button>
        </div>
        {isLoading ? (
          <div className="py-12">
            <LoadingTimeout loadingMessage="Loading notifications..." />
          </div>
        ) : notifications.length === 0 ? (
          <div className="py-12 text-center text-gray-500">
            <CheckCircle2 className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <p className="text-base font-medium mb-2">
              {filter === "unread" ? "No unread notifications" : "No new notifications"}
            </p>
            <Link
              href="/provider/settings/notifications"
              className="text-sm text-primary hover:underline"
            >
              Manage notifications
            </Link>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm text-gray-600">
                  {totalUnread > 0 ? `${totalUnread} unread` : "All caught up"}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  Tap to open · Trash removes · Mail icon marks unread again
                </p>
              </div>
              {totalUnread > 0 && (
                <Button variant="outline" size="sm" onClick={handleMarkAllRead}>
                  Mark all read
                </Button>
              )}
            </div>
            <div className="divide-y">
              {notifications.map((notification) => {
                const Icon = getNotificationIcon(notification.type);
                const isExpanded = expandedId === notification.id;
                const derivedUrl = deriveNotificationUrl(notification);
                return (
                  <div key={notification.id}>
                    <div
                      className={cn(
                        "flex items-stretch gap-0 border-b border-gray-100 last:border-b-0",
                        !notification.read && "bg-blue-50/50",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => void handleNotificationClick(notification)}
                        className={cn(
                          "min-w-0 flex-1 text-left p-4 hover:bg-gray-50/80 transition-colors",
                          !notification.read && "bg-blue-50/50 hover:bg-blue-50/70",
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={cn(
                              "p-2 rounded-lg border flex-shrink-0",
                              getPriorityColor(notification.priority),
                            )}
                          >
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <p
                                className={cn(
                                  "font-medium text-sm text-gray-900",
                                  !notification.read && "font-semibold",
                                )}
                              >
                                {notification.title}
                              </p>
                              {!notification.read && (
                                <span className="w-2 h-2 bg-primary rounded-full mt-1.5 flex-shrink-0" />
                              )}
                            </div>
                            <p className={cn("text-sm text-gray-600 mb-1", !isExpanded && "line-clamp-3")}>
                              {notification.message}
                            </p>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-500">{formatTimeAgo(notification.timestamp)}</span>
                              {!derivedUrl && notification.message.length > 120 && (
                                <span className="text-xs text-gray-400">
                                  {isExpanded ? <ChevronUp className="w-3 h-3 inline" /> : <ChevronDown className="w-3 h-3 inline" />}
                                  <span className="ml-0.5">{isExpanded ? "Less" : "More"}</span>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                      <div className="flex flex-col justify-start gap-0.5 py-2 pr-2 shrink-0 border-l border-gray-100 bg-white/50">
                        {notification.read && (
                          <button
                            type="button"
                            onClick={(e) => void handleMarkUnread(e, notification)}
                            className="p-2 text-gray-400 hover:text-blue-500 transition-colors rounded-lg"
                            title="Mark as unread"
                          >
                            <MailOpen className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => void handleDeleteNotification(e, notification)}
                          className="p-2 text-gray-400 hover:text-red-500 transition-colors rounded-lg"
                          title="Delete notification"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="px-4 pb-3 pt-0 ml-12 text-sm text-gray-600 space-y-2 border-b">
                        <p>{notification.message}</p>
                        {notification.metadata && Object.keys(notification.metadata).length > 0 && (
                          <div className="text-xs text-gray-400 space-y-0.5">
                            {Object.entries(notification.metadata).map(([k, v]) => (
                              <p key={k}><span className="font-medium">{k}:</span> {String(v)}</p>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </SectionCard>

      <div className="text-center">
        <Link
          href="/provider/settings/notifications"
          className="text-sm text-primary hover:underline"
        >
          Manage notifications
        </Link>
      </div>
    </div>
  );
}
