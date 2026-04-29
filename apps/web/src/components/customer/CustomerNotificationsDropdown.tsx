"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  X,
  Calendar,
  DollarSign,
  Clock,
  CheckCircle2,
  MessageSquare,
  Package,
  Zap,
  Sparkles,
  Trash2,
} from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetcher } from "@/lib/http/fetcher";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/providers/AuthProvider";
import { deriveCustomerNotificationHref } from "@/lib/customer/derive-customer-notification-url";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  timestamp: string;
  link?: string;
  action_url?: string;
  priority: 'low' | 'medium' | 'high';
  read: boolean;
  metadata?: Record<string, any>;
  data?: Record<string, any>;
}

interface NotificationResponse {
  notifications: Notification[];
  total_unread: number;
}

const getNotificationIcon = (type: string) => {
  switch (type) {
    case 'new_message':
      return MessageSquare;
    case 'custom_offer':
      return Sparkles;
    case 'custom_request':
      return Package;
    case 'booking_confirmed':
    case 'booking_cancelled':
    case 'booking_rescheduled':
      return Calendar;
    case 'payment_received':
    case 'payment_failed':
    case 'refund_processed':
      return DollarSign;
    case 'appointment_reminder':
      return Clock;
    case 'account_verification':
      return CheckCircle2;
    case 'high_priority':
      return Zap;
    default:
      return Bell;
  }
};

const getPriorityColor = (priority: string) => {
  switch (priority) {
    case 'high':
      return 'text-red-600 bg-red-50 border-red-200';
    case 'medium':
      return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    default:
      return 'text-blue-600 bg-blue-50 border-blue-200';
  }
};

const formatTimeAgo = (timestamp: string) => {
  const now = new Date();
  const time = new Date(timestamp);
  const diffInSeconds = Math.floor((now.getTime() - time.getTime()) / 1000);

  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
  return time.toLocaleDateString();
};

const realtimeChannelKey = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function CustomerNotificationsDropdown() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [totalUnread, setTotalUnread] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const { user, session, isLoading: authLoading } = useAuth();
  const loadAttemptRef = useRef(0);

  const loadNotifications = useCallback(async (silent = false, opts?: { staleTimeMs?: number }) => {
    if (!user?.id || !session) {
      setNotifications([]);
      setTotalUnread(0);
      setIsLoading(false);
      return;
    }
    const attempt = ++loadAttemptRef.current;
    try {
      if (!silent) setIsLoading(true);
      // Default 30s stale: polling + realtime keep data fresh; opening the popover
      // passes staleTimeMs: 0 so users never see a cached list after acting elsewhere.
      const staleMs = opts?.staleTimeMs ?? 30_000;
      const response = await fetcher.get<{ data?: NotificationResponse } & NotificationResponse>('/api/me/notifications', { staleTimeMs: staleMs });
      const data = response.data ?? response;
      setNotifications(data.notifications || []);
      setTotalUnread(data.total_unread || 0);
    } catch (error: any) {
      const status = error?.status;
      if (status !== 401 && status !== 403) {
        console.error('Failed to load notifications:', error);
      }
      // Avoid noisy toasts on the very first load; show on refresh / later attempts.
      if (!silent && attempt > 1) {
        toast.error('Failed to load notifications');
      }
      if (!silent) {
        setNotifications([]);
        setTotalUnread(0);
      }
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [session, user?.id]);

  useEffect(() => {
    if (authLoading) return;
    if (!user?.id || !session) {
      setIsLoading(false);
      setNotifications([]);
      setTotalUnread(0);
      return;
    }
    void loadNotifications(false);

    const supabase = getSupabaseClient();
    const enableRealtime = process.env.NODE_ENV === "production";
    let channel: ReturnType<typeof supabase.channel> | null = null;
    if (enableRealtime) {
      try {
        channel = supabase
          .channel(`notifications:customer:${user.id}:${realtimeChannelKey()}`)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
            () => {
              void loadNotifications(true);
            }
          )
          .subscribe();
      } catch (error) {
        console.warn("Customer notification realtime subscription failed:", error);
      }
    }

    const interval = setInterval(() => void loadNotifications(true), 120000);

    return () => {
      if (channel) {
        try {
          supabase.removeChannel(channel);
        } catch {
          // ignore
        }
      }
      clearInterval(interval);
    };
  }, [authLoading, session, user?.id, loadNotifications]);

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
        await fetcher.post(`/api/me/notifications/${notification.id}/read`);
      } catch (error) {
        console.error("Failed to mark notification as read:", error);
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === notification.id ? { ...n, read: false } : n,
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
      setOpen(false);
      router.push(href);
    } else if (data.conversation_id) {
      setOpen(false);
      router.push(`/account-settings/messages?conversation=${data.conversation_id}`);
    } else if (data.booking_id) {
      setOpen(false);
      router.push(`/account-settings/bookings/${data.booking_id}`);
    } else if (data.request_id) {
      setOpen(false);
      router.push('/account-settings/custom-requests');
    } else {
      setOpen(false);
      router.push('/account-settings/notifications/inbox');
    }
  };

  const handleMarkAllRead = async () => {
    const prevNotifications = notifications;
    const prevUnread = totalUnread;
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setTotalUnread(0);
    try {
      await fetcher.post("/api/me/notifications/mark-all-read");
      toast.success("All notifications marked as read");
    } catch (error) {
      console.error("Failed to mark all as read:", error);
      setNotifications(prevNotifications);
      setTotalUnread(prevUnread);
      toast.error("Failed to mark all as read");
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
      await fetcher.delete(`/api/me/notifications/${encodeURIComponent(notification.id)}`);
    } catch (error) {
      console.error("Failed to delete notification:", error);
      setNotifications(prevList);
      setTotalUnread(prevUnread);
      toast.error("Could not delete notification");
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next && user?.id && session) {
          void loadNotifications(true, { staleTimeMs: 0 });
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={totalUnread > 0 ? `Notifications, ${totalUnread} unread` : "Notifications"}
          className="relative min-h-[44px] min-w-[44px] touch-manipulation rounded-full hover:bg-gray-100/90"
        >
          <Bell className="w-5 h-5 text-gray-700" />
          {totalUnread > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-0.5 -right-0.5 h-5 min-w-5 px-1.5 flex items-center justify-center text-[10px] font-semibold rounded-full border-2 border-white shadow-sm"
            >
              {totalUnread > 99 ? '99+' : totalUnread}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className={cn(
          "w-[min(100vw-1.25rem,22rem)] sm:w-[22rem] p-0 max-h-[min(85vh,32rem)] overflow-hidden flex flex-col",
          "rounded-2xl border border-gray-200/90 bg-white shadow-xl shadow-gray-300/40",
        )}
      >
        <div className="flex items-start justify-between gap-2 px-4 py-3.5 border-b border-gray-100 bg-gradient-to-b from-gray-50/95 to-white rounded-t-2xl">
          <div className="min-w-0">
            <h3 className="font-semibold text-base text-gray-900 tracking-tight">Notifications</h3>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Tap to open · Trash removes from list
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {totalUnread > 0 && (
              <>
                <Badge variant="secondary" className="text-[10px] font-medium rounded-full px-2.5 py-0.5 border-0 bg-primary/10 text-primary">
                  {totalUnread} new
                </Badge>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleMarkAllRead()}
                  className="h-8 rounded-full px-3 text-xs font-medium border-gray-200 bg-white hover:bg-gray-50 touch-manipulation"
                >
                  Mark all read
                </Button>
              </>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Close notifications"
              onClick={() => setOpen(false)}
              className="h-9 w-9 rounded-full touch-manipulation text-gray-500 hover:text-gray-900 hover:bg-gray-100"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div
          className="flex-1 overflow-y-auto overscroll-contain p-2"
          aria-busy={isLoading}
        >
          {isLoading ? (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/60 p-8 text-center text-gray-500">
              <Clock className="w-8 h-8 mx-auto mb-3 animate-spin text-primary/70" aria-hidden />
              <p className="text-sm font-medium text-gray-700">Loading…</p>
              <p className="text-xs text-gray-500 mt-1">Fetching your latest updates</p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-gradient-to-b from-gray-50/80 to-white p-6 text-center">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-emerald-500/80" aria-hidden />
              <p className="text-sm font-semibold text-gray-900">You&apos;re all caught up</p>
              <p className="text-xs text-gray-500 mt-1 mb-4">No new notifications right now.</p>
              <div className="flex flex-col sm:flex-row items-stretch justify-center gap-2">
                <Button
                  asChild
                  className="rounded-full bg-primary hover:bg-primary/90 text-white shadow-sm"
                >
                  <Link href="/account-settings/notifications/inbox" onClick={() => setOpen(false)}>
                    View inbox
                  </Link>
                </Button>
                <Button asChild variant="outline" className="rounded-full border-gray-200">
                  <Link href="/account-settings/notifications" onClick={() => setOpen(false)}>
                    Preferences
                  </Link>
                </Button>
              </div>
            </div>
          ) : (
            <ul className="flex flex-col gap-1.5 list-none m-0 p-0">
              {notifications.map((notification) => {
                const Icon = getNotificationIcon(notification.type);
                return (
                  <li key={notification.id}>
                    <div
                      className={cn(
                        "group flex items-stretch gap-0.5 rounded-2xl border transition-all",
                        "border-transparent hover:border-gray-200 hover:bg-white hover:shadow-md",
                        !notification.read
                          ? "bg-primary/[0.06] border-primary/10 shadow-sm"
                          : "bg-gray-50/40",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => void handleNotificationClick(notification)}
                        className={cn(
                          "flex min-w-0 flex-1 items-start gap-3 rounded-2xl px-3 py-3 text-left sm:px-3.5 sm:py-3.5 touch-manipulation",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-inset",
                        )}
                      >
                        <div
                          className={cn(
                            "p-2.5 rounded-xl border flex-shrink-0",
                            getPriorityColor(notification.priority),
                          )}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-0.5">
                            <p
                              className={cn(
                                "font-medium text-sm text-gray-900 leading-snug",
                                !notification.read && "font-semibold",
                              )}
                            >
                              {notification.title}
                            </p>
                            {!notification.read && (
                              <span className="w-2 h-2 bg-[#FF0077] rounded-full flex-shrink-0 mt-1.5 ring-2 ring-white" />
                            )}
                          </div>
                          <p className="text-xs sm:text-sm text-gray-600 line-clamp-2 leading-relaxed">
                            {notification.message}
                          </p>
                          <span className="text-[11px] text-gray-400 mt-1.5 inline-block">
                            {formatTimeAgo(notification.timestamp)}
                          </span>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => void handleDeleteNotification(e, notification)}
                        className={cn(
                          "flex-shrink-0 self-start rounded-xl p-2.5 m-1 text-gray-400 hover:text-red-600 hover:bg-red-50",
                          "opacity-70 group-hover:opacity-100 transition-opacity touch-manipulation",
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
        </div>

        <div className="px-3 py-3 border-t border-gray-100 bg-gray-50/95 rounded-b-2xl flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Button asChild variant="default" size="sm" className="w-full sm:w-auto rounded-full bg-primary hover:bg-primary/90 shadow-sm">
            <Link href="/account-settings/notifications/inbox" onClick={() => setOpen(false)}>
              Open inbox
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm" className="w-full sm:w-auto rounded-full text-gray-600 hover:text-gray-900 hover:bg-gray-200/60">
            <Link href="/account-settings/notifications" onClick={() => setOpen(false)}>
              Notification settings
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
