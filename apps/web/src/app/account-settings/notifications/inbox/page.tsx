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
} from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetcher } from "@/lib/http/fetcher";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/providers/AuthProvider";
import AuthGuard from "@/components/auth/auth-guard";
import Link from "next/link";
import { deriveCustomerNotificationHref } from "@/lib/customer/derive-customer-notification-url";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  created_at: string;
  timestamp?: string;
  link?: string;
  action_url?: string;
  priority?: "low" | "medium" | "high";
  is_read: boolean;
  read?: boolean;
  metadata?: Record<string, unknown>;
  data?: Record<string, unknown>;
}

interface NotificationResponse {
  notifications: Notification[];
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

type Filter = "all" | "unread";

function NotificationsInbox() {
  const { user } = useAuth();
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [totalUnread, setTotalUnread] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const loadRef = useRef<((silent?: boolean) => Promise<void>) | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!user?.id) return;
      if (!silent) setIsLoading(true);
      try {
        const url =
          filter === "unread"
            ? "/api/me/notifications?unread_only=true&limit=50"
            : "/api/me/notifications?limit=50";
        const response = await fetcher.get<{ data?: NotificationResponse } & NotificationResponse>(url);
        const data = (response as { data?: NotificationResponse }).data ?? (response as NotificationResponse);
        setNotifications(data.notifications || []);
        setTotalUnread(data.total_unread || 0);
      } catch {
        setNotifications([]);
        setTotalUnread(0);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [user?.id, filter]
  );

  loadRef.current = load;

  useEffect(() => {
    load();
  }, [load]);

  // Realtime subscription
  useEffect(() => {
    if (!user?.id) return;
    const supabase = getSupabaseClient();
    const channel = supabase
      .channel(`notifications:inbox:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => {
          loadRef.current?.(true);
        }
      )
      .subscribe();
    return () => {
      try { supabase.removeChannel(channel); } catch { /* ignore */ }
    };
  }, [user?.id]);

  const handleNotificationClick = async (notification: Notification) => {
    const isRead = notification.is_read || notification.read;
    if (!isRead) {
      try {
        await fetcher.post(`/api/me/notifications/${notification.id}/read`);
        setNotifications((prev) =>
          prev.map((n) => (n.id === notification.id ? { ...n, is_read: true, read: true } : n))
        );
        setTotalUnread((prev) => Math.max(0, prev - 1));
      } catch {
        // ignore
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
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await fetcher.post("/api/me/notifications/mark-all-read");
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true, read: true })));
      setTotalUnread(0);
      toast.success("All notifications marked as read");
    } catch {
      toast.error("Failed to mark all as read");
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await load(true);
    setIsRefreshing(false);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          {totalUnread > 0 && (
            <p className="text-sm text-gray-500 mt-0.5">
              {totalUnread} unread notification{totalUnread !== 1 ? "s" : ""}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {totalUnread > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleMarkAllRead}
              className="text-sm"
            >
              Mark all read
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            disabled={isRefreshing}
            title="Refresh"
          >
            <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin")} />
          </Button>
          <Link href="/account-settings/notifications">
            <Button variant="ghost" size="icon" title="Notification preferences">
              <Settings className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4">
        {(["all", "unread"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-4 py-2 rounded-full text-sm font-medium transition-colors",
              filter === f
                ? "bg-[#FF0077] text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            )}
          >
            {f === "all" ? "All" : "Unread"}
            {f === "unread" && totalUnread > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-xs">
                {totalUnread}
              </Badge>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <RefreshCw className="w-8 h-8 animate-spin mb-3" />
          <p className="text-sm">Loading notifications…</p>
        </div>
      ) : notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <Bell className="w-12 h-12 mb-4 text-gray-300" />
          <p className="font-medium text-gray-600">
            {filter === "unread" ? "No unread notifications" : "No notifications yet"}
          </p>
          <p className="text-sm mt-1">
            {filter === "unread"
              ? "You're all caught up!"
              : "We'll notify you about bookings, messages, and more."}
          </p>
          {filter === "unread" && (
            <button
              onClick={() => setFilter("all")}
              className="mt-4 text-sm text-[#FF0077] hover:underline"
            >
              View all notifications
            </button>
          )}
        </div>
      ) : (
        <div className="divide-y divide-gray-100 rounded-xl border border-gray-100 overflow-hidden bg-white shadow-sm">
          {notifications.map((notification) => {
            const Icon = getNotificationIcon(notification.type);
            const isRead = notification.is_read || notification.read;
            const ts = notification.created_at || notification.timestamp || "";
            return (
              <button
                key={notification.id}
                onClick={() => handleNotificationClick(notification)}
                className={cn(
                  "w-full text-left p-4 hover:bg-gray-50 transition-colors flex items-start gap-4",
                  !isRead && "bg-pink-50/40"
                )}
              >
                <div
                  className={cn(
                    "p-2.5 rounded-xl border flex-shrink-0 mt-0.5",
                    getIconColor(notification.type, notification.priority)
                  )}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-0.5">
                    <p className={cn("text-sm text-gray-900", !isRead && "font-semibold")}>
                      {notification.title}
                    </p>
                    {!isRead && (
                      <span className="w-2 h-2 bg-[#FF0077] rounded-full flex-shrink-0 mt-1.5" />
                    )}
                  </div>
                  <p className="text-sm text-gray-500 line-clamp-2 mb-1">
                    {notification.message}
                  </p>
                  <span className="text-xs text-gray-400">{formatTimeAgo(ts)}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Footer */}
      <div className="mt-6 text-center">
        <Link
          href="/account-settings/notifications"
          className="text-sm text-[#FF0077] hover:underline"
        >
          Manage notification preferences →
        </Link>
      </div>
    </div>
  );
}

export default function NotificationsInboxPage() {
  return (
    <AuthGuard>
      <NotificationsInbox />
    </AuthGuard>
  );
}
