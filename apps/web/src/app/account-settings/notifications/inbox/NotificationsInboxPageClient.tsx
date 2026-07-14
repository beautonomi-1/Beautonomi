"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  Calendar,
  DollarSign,
  Clock,
  CheckCircle2,
  MessageSquare,
  Package,
  Zap,
  Sparkles,
  Settings,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetcher, deleteFetcherGetCacheEntriesMatching } from "@/lib/http/fetcher";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/providers/AuthProvider";
import Link from "next/link";
import BackButton from "../../components/back-button";
import Breadcrumb from "../../components/breadcrumb";
import { deriveCustomerNotificationHref } from "@/lib/customer/derive-customer-notification-url";
import type { InboxNotification, NotificationsInboxInitial } from "./notification-inbox-types";

interface NotificationResponse {
  notifications: InboxNotification[];
  total_unread: number;
}

const getNotificationIcon = (type: string) => {
  switch (type) {
    case "new_message":
      return MessageSquare;
    case "custom_offer":
      return Sparkles;
    case "custom_request":
      return Package;
    case "booking_confirmed":
    case "booking_cancelled":
    case "booking_rescheduled":
    case "appointment_reminder":
      return Calendar;
    case "payment_received":
    case "payment_failed":
    case "refund_processed":
      return DollarSign;
    case "service_complete":
    case "provider_arrived":
      return Clock;
    case "account_verification":
    case "booking_accepted":
      return CheckCircle2;
    case "high_priority":
      return Zap;
    default:
      return Bell;
  }
};

const getIconColor = (type: string, priority: string = "low") => {
  if (priority === "high") return "text-red-600 bg-red-50 border-red-200";
  switch (type) {
    case "new_message":
      return "text-blue-600 bg-blue-50 border-blue-200";
    case "booking_confirmed":
    case "booking_accepted":
      return "text-green-600 bg-green-50 border-green-200";
    case "booking_cancelled":
      return "text-red-600 bg-red-50 border-red-200";
    case "payment_received":
      return "text-emerald-600 bg-emerald-50 border-emerald-200";
    case "payment_failed":
      return "text-red-600 bg-red-50 border-red-200";
    case "custom_offer":
    case "custom_request":
      return "text-purple-600 bg-purple-50 border-purple-200";
    default:
      return "text-gray-600 bg-gray-50 border-gray-200";
  }
};

const formatTimeAgo = (ts: string) => {
  const now = new Date();
  const time = new Date(ts);
  const diff = Math.floor((now.getTime() - time.getTime()) / 1000);
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return time.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
};

const realtimeChannelKey = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

type Filter = "all" | "unread";

function NotificationsInbox({ initialInbox }: { initialInbox: NotificationsInboxInitial | null }) {
  const { user } = useAuth();
  const router = useRouter();
  const initialSnapshot = useRef(initialInbox);
  const [notifications, setNotifications] = useState<InboxNotification[]>(
    () => initialInbox?.notifications ?? [],
  );
  const [totalUnread, setTotalUnread] = useState(() => initialInbox?.total_unread ?? 0);
  const [isLoading, setIsLoading] = useState(() => !initialInbox);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const loadRef = useRef<((silent?: boolean, opts?: { staleTimeMs?: number }) => Promise<void>) | null>(null);
  const skipHydrateFetchOnce = useRef(Boolean(initialInbox));

  const load = useCallback(
    async (silent = false, opts?: { staleTimeMs?: number }) => {
      if (!user?.id) return;
      if (!silent) setIsLoading(true);
      try {
        const url =
          filter === "unread"
            ? "/api/me/notifications?unread_only=true&limit=50"
            : "/api/me/notifications?limit=50";
        const response = await fetcher.get<{ data?: NotificationResponse } & NotificationResponse>(url, {
          staleTimeMs: opts?.staleTimeMs,
        });
        const data = (response as { data?: NotificationResponse }).data ?? (response as NotificationResponse);
        setNotifications(data.notifications || []);
        setTotalUnread(data.total_unread || 0);
      } catch {
        if (!silent) {
          setNotifications([]);
          setTotalUnread(0);
        }
      } finally {
        if (!silent) setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [user?.id, filter]
  );

  loadRef.current = load;

  useEffect(() => {
    if (skipHydrateFetchOnce.current && filter === "all" && initialSnapshot.current) {
      skipHydrateFetchOnce.current = false;
      setNotifications(initialSnapshot.current.notifications);
      setTotalUnread(initialSnapshot.current.total_unread);
      setIsLoading(false);
      return;
    }
    if (!user?.id) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial snapshot is fixed for this navigation
  }, [load, filter, user?.id]);

  // Realtime subscription
  useEffect(() => {
    if (!user?.id) return;
    const supabase = getSupabaseClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(`notifications:inbox:${user.id}:${realtimeChannelKey()}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
          () => {
            // Bypass the GET cache — the DB just changed, cached data is stale.
            loadRef.current?.(true, { staleTimeMs: 0 });
          }
        )
        .subscribe();
    } catch (error) {
      console.warn("Customer notifications inbox realtime subscription failed:", error);
    }
    return () => {
      if (!channel) return;
      try { supabase.removeChannel(channel); } catch { /* ignore */ }
    };
  }, [user?.id]);

  const handleNotificationClick = async (notification: InboxNotification) => {
    const isRead = notification.is_read || notification.read;
    const unreadBefore = totalUnread;
    if (!isRead) {
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notification.id ? { ...n, is_read: true, read: true } : n,
        ),
      );
      setTotalUnread((prev) => Math.max(0, prev - 1));
      try {
        await fetcher.post(`/api/me/notifications/${notification.id}/read`);
        deleteFetcherGetCacheEntriesMatching("/api/me/notifications");
      } catch {
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === notification.id ? { ...n, is_read: false, read: false } : n,
          ),
        );
        setTotalUnread(unreadBefore);
        toast.error("Could not mark as read. Try again.");
        return;
      }
    }

    const href = deriveCustomerNotificationHref(notification);
    const data = notification.data ?? notification.metadata ?? {};
    if (href) {
      router.push(href);
    } else if ((data as Record<string, unknown>).conversation_id) {
      router.push(`/account-settings/messages?conversation=${(data as Record<string, unknown>).conversation_id}`);
    } else if ((data as Record<string, unknown>).booking_id) {
      router.push(`/account-settings/bookings/${(data as Record<string, unknown>).booking_id}`);
    } else if ((data as Record<string, unknown>).request_id) {
      router.push("/account-settings/custom-requests");
    } else {
      toast.info("No quick link for this notification — it stays in your inbox.");
    }
  };

  const handleMarkAllRead = async () => {
    const prevNotifications = notifications;
    const prevUnread = totalUnread;
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true, read: true })));
    setTotalUnread(0);
    try {
      await fetcher.post("/api/me/notifications/mark-all-read");
      deleteFetcherGetCacheEntriesMatching("/api/me/notifications");
      toast.success("All notifications marked as read");
    } catch {
      setNotifications(prevNotifications);
      setTotalUnread(prevUnread);
      toast.error("Failed to mark all as read");
    }
  };

  const handleDeleteNotification = async (
    e: React.MouseEvent,
    notification: InboxNotification,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    if (
      typeof window !== "undefined" &&
      !window.confirm("Delete this notification? It will be removed from your list.")
    ) {
      return;
    }
    const isUnread = !(notification.is_read || notification.read);
    const prevList = notifications;
    const prevUnread = totalUnread;
    setNotifications((prev) => prev.filter((n) => n.id !== notification.id));
    if (isUnread) {
      setTotalUnread((u) => Math.max(0, u - 1));
    }
    try {
      await fetcher.delete(
        `/api/me/notifications/${encodeURIComponent(notification.id)}`,
      );
      deleteFetcherGetCacheEntriesMatching("/api/me/notifications");
    } catch {
      setNotifications(prevList);
      setTotalUnread(prevUnread);
      toast.error("Could not delete notification");
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await load(true, { staleTimeMs: 0 });
    setIsRefreshing(false);
  };

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-6 sm:py-10">
      <BackButton href="/account-settings" />
      <Breadcrumb
        items={[
          { label: "Account", href: "/account-settings" },
          { label: "Notifications", href: "/account-settings/notifications" },
          { label: "Inbox" },
        ]}
      />

      <div className="mt-5 rounded-3xl border border-gray-200/80 bg-white/90 shadow-sm shadow-gray-200/40 p-5 sm:p-7">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-6">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-gray-900">Inbox</h1>
            <p className="text-sm text-gray-500 mt-1">
              {totalUnread > 0
                ? `${totalUnread} unread — tap a row to open · trash removes an item`
                : "All caught up — we’ll show new activity here"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {totalUnread > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleMarkAllRead()}
                className="rounded-full border-gray-200 text-sm font-medium touch-manipulation"
              >
                Mark all read
              </Button>
            )}
            <Button
              variant="outline"
              size="icon"
              onClick={() => void handleRefresh()}
              disabled={isRefreshing}
              title="Refresh"
              className="rounded-full border-gray-200 touch-manipulation"
            >
              <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin")} />
            </Button>
            <Link href="/account-settings/notifications" className="inline-flex">
              <Button
                variant="default"
                size="sm"
                className="rounded-full bg-primary hover:bg-primary/90 shadow-sm touch-manipulation gap-1.5"
              >
                <Settings className="w-4 h-4" />
                <span className="hidden sm:inline">Settings</span>
              </Button>
            </Link>
          </div>
        </div>

        {/* Filter — segmented control */}
        <div
          className="inline-flex p-1 rounded-2xl bg-gray-100/90 border border-gray-200/80 mb-5 w-full sm:w-auto"
          role="tablist"
          aria-label="Filter notifications"
        >
          {(["all", "unread"] as const).map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={cn(
                "flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-sm font-medium transition-all touch-manipulation min-h-[44px]",
                filter === f
                  ? "bg-white text-gray-900 shadow-md border border-gray-100"
                  : "text-gray-600 hover:text-gray-900",
              )}
            >
              <span className="inline-flex items-center justify-center gap-1.5">
                {f === "all" ? "All" : "Unread"}
                {f === "unread" && totalUnread > 0 && (
                  <Badge className="rounded-full bg-primary/15 text-primary border-0 text-[10px] px-2 font-semibold">
                    {totalUnread}
                  </Badge>
                )}
              </span>
            </button>
          ))}
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 py-16 text-center">
            <p className="text-sm font-medium text-gray-700">Loading notifications…</p>
            <p className="text-xs text-gray-500 mt-1">One moment</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-gradient-to-b from-gray-50/70 to-white py-14 px-6 text-center">
            <Bell className="w-12 h-12 mx-auto mb-3 text-gray-300" aria-hidden />
            <p className="font-semibold text-gray-800">
              {filter === "unread" ? "No unread notifications" : "No notifications yet"}
            </p>
            <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
              {filter === "unread"
                ? "Switch to All to see older items."
                : "We’ll notify you about bookings, messages, offers, and more."}
            </p>
            {filter === "unread" && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setFilter("all")}
                className="mt-5 rounded-full border-gray-200"
              >
                Show all notifications
              </Button>
            )}
          </div>
        ) : (
          <ul className="flex flex-col gap-2.5 list-none m-0 p-0">
            {notifications.map((notification) => {
              const Icon = getNotificationIcon(notification.type);
              const isRead = notification.is_read || notification.read;
              const ts = notification.created_at || notification.timestamp || "";
              return (
                <li key={notification.id}>
                  <div
                    className={cn(
                      "flex items-stretch gap-0.5 rounded-2xl border transition-all",
                      "border-gray-100 bg-white hover:border-gray-200 hover:shadow-md",
                      !isRead && "border-primary/15 bg-primary/[0.04] ring-1 ring-primary/10",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => void handleNotificationClick(notification)}
                      className={cn(
                        "flex min-w-0 flex-1 items-start gap-3.5 rounded-2xl px-4 py-4 text-left touch-manipulation",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:ring-inset",
                      )}
                    >
                      <div
                        className={cn(
                          "p-2.5 rounded-xl border flex-shrink-0 mt-0.5",
                          getIconColor(notification.type, notification.priority),
                        )}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-0.5">
                          <p className={cn("text-sm text-gray-900 leading-snug", !isRead && "font-semibold")}>
                            {notification.title}
                          </p>
                          {!isRead && (
                            <span className="w-2 h-2 bg-[#FF0077] rounded-full flex-shrink-0 mt-1.5 ring-2 ring-white" />
                          )}
                        </div>
                        <p className="text-sm text-gray-500 line-clamp-3 leading-relaxed mb-1">{notification.message}</p>
                        <span className="text-[11px] text-gray-400">{formatTimeAgo(ts)}</span>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => void handleDeleteNotification(e, notification)}
                      className={cn(
                        "flex-shrink-0 self-start rounded-xl p-3 m-2 text-gray-400 hover:text-red-600 hover:bg-red-50",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300",
                      )}
                      aria-label="Delete notification"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-8 pt-5 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-xs text-gray-500">Tip: pull to refresh isn&apos;t available on web — use the refresh button.</p>
          <Button asChild variant="ghost" size="sm" className="rounded-full text-primary hover:text-primary/90 self-start sm:self-auto">
            <Link href="/account-settings/notifications">Notification preferences →</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function NotificationsInboxPageClient({
  initialInbox,
}: {
  initialInbox: NotificationsInboxInitial | null;
}) {
  return <NotificationsInbox initialInbox={initialInbox} />;
}
