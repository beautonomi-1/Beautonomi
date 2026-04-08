"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  X,
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
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetcher, FetchTimeoutError } from "@/lib/http/fetcher";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useAuth } from "@/providers/AuthProvider";
import { deriveProviderPortalNotificationUrl } from "@/lib/provider/derive-provider-notification-url";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  timestamp: string;
  link?: string;
  priority: 'low' | 'medium' | 'high';
  read: boolean;
  metadata?: Record<string, any>;
  /** JSONB from API (subscription_limit alerts, etc.) */
  data?: Record<string, any>;
}

interface NotificationResponse {
  notifications: Notification[];
  total_unread: number;
}

const getNotificationIcon = (type: string, meta?: Record<string, any>) => {
  if (meta?.subscription_limit) {
    return AlertTriangle;
  }
  switch (type) {
    case 'appointment_reminder':
    case 'appointment_cancelled':
    case 'appointment_rescheduled':
    case 'new_appointment':
      return Calendar;
    case 'payment_received':
    case 'payout_processed':
    case 'refund_processed':
      return DollarSign;
    case 'new_client':
    case 'client_message':
      return User;
    case 'staff_clock_in':
    case 'staff_clock_out':
    case 'shift_reminder':
      return Clock;
    case 'service_booking':
    case 'product_order':
      return Package;
    case 'team_member_added':
    case 'team_member_updated':
      return Users;
    case 'system_update':
    case 'maintenance':
      return Settings;
    case 'report_ready':
    case 'document_ready':
      return FileText;
    case 'payment_failed':
    case 'subscription_expiring':
      return AlertTriangle;
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

function deriveNotificationUrl(notification: Notification): string | undefined {
  return deriveProviderPortalNotificationUrl({
    link: notification.link,
    data: notification.data,
    metadata: notification.metadata,
  });
}

export function ProviderNotificationsDropdown() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [totalUnread, setTotalUnread] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    // Only fetch notifications when user is authenticated (avoids 401 from API)
    if (user?.id) {
      loadNotifications();
    } else {
      setIsLoading(false);
      setNotifications([]);
      setTotalUnread(0);
    }

    // Realtime + React Strict Mode (dev): first mount's channel is torn down while the WebSocket is
    // still connecting, which spams the console. Poll in dev; use realtime in production.
    const supabase = getSupabaseClient();
    let subscription: any = null;

    if (user?.id && process.env.NODE_ENV === "production") {
      // Subscribe to new notifications for this user
      subscription = supabase
        .channel(`notifications:${user.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            // New notification received
            const newNotification = payload.new as any;
            setNotifications((prev) => {
              // Check if notification already exists (avoid duplicates)
              if (prev.find((n) => n.id === newNotification.id)) {
                return prev;
              }
              return [{
                id: newNotification.id,
                type: newNotification.type,
                title: newNotification.title,
                message: newNotification.message,
                timestamp: newNotification.created_at,
                link: newNotification.link ?? newNotification.action_url ?? undefined,
                priority: (newNotification.priority || 'low') as 'low' | 'medium' | 'high',
                read: newNotification.is_read || false,
                metadata: newNotification.metadata,
                data: newNotification.data,
              }, ...prev];
            });
            
            if (!newNotification.is_read) {
              setTotalUnread((prev) => prev + 1);
              // Show toast for high priority notifications
              if (newNotification.priority === 'high') {
                toast.info(newNotification.title, {
                  description: newNotification.message,
                });
              }
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            // Notification updated (e.g., marked as read)
            const updatedNotification = payload.new as any;
            setNotifications((prev) =>
              prev.map((n) =>
                n.id === updatedNotification.id
                  ? {
                      ...n,
                      read: updatedNotification.is_read || false,
                    }
                  : n
              )
            );
            
            if (updatedNotification.is_read) {
              setTotalUnread((prev) => Math.max(0, prev - 1));
            }
          }
        )
        .subscribe();
    }

    const pollMs =
      process.env.NODE_ENV === "development" ? 60_000 : 300_000;
    const interval = user?.id ? setInterval(loadNotifications, pollMs) : undefined;

    return () => {
      if (subscription) {
        try {
          supabase.removeChannel(subscription);
        } catch {
          // Ignore when channel is still connecting (e.g. React Strict Mode unmount)
        }
      }
      if (interval) clearInterval(interval);
    };
  }, [user?.id]);

  const loadNotifications = async () => {
    try {
      setIsLoading(true);
      const response = await fetcher.get<{ data: NotificationResponse }>('/api/provider/notifications');
      // API returns { data: { notifications: [], total_unread: 0 } }
      const notificationData: NotificationResponse = response.data ?? { notifications: [], total_unread: 0 };
      setNotifications(notificationData.notifications || []);
      setTotalUnread(notificationData.total_unread || 0);
    } catch (error) {
      // Suppress AbortErrors from cancelled requests (component unmounts, navigation)
      if (error instanceof FetchTimeoutError && error.message.includes('cancelled')) {
        return; // Silently ignore cancelled requests
      }
      console.error('Failed to load notifications:', error);
      // Don't show error toast on initial load
      if (!isLoading) {
        toast.error('Failed to load notifications');
      }
      setNotifications([]);
      setTotalUnread(0);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.read) {
      try {
        await fetcher.post(`/api/provider/notifications/${notification.id}/read`, {});
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === notification.id ? { ...n, read: true } : n
          )
        );
        setTotalUnread((prev) => Math.max(0, prev - 1));
      } catch (error) {
        console.error('Failed to mark notification as read:', error);
        toast.error('Could not mark notification as read');
      }
    }

    const url = deriveNotificationUrl(notification);
    if (url) {
      setOpen(false);
      try {
        router.push(url);
      } catch (e) {
        console.error('Navigation failed:', e);
        toast.error('Could not open link for this notification');
      }
    } else {
      setExpandedId((prev) => (prev === notification.id ? null : notification.id));
    }
  };

  const handleDeleteNotification = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await fetcher.delete(`/api/provider/notifications/${id}`);
      setNotifications((prev) => {
        const removed = prev.find((n) => n.id === id);
        if (removed && !removed.read) {
          setTotalUnread((u) => Math.max(0, u - 1));
        }
        return prev.filter((n) => n.id !== id);
      });
    } catch (error) {
      console.error('Failed to delete notification:', error);
      toast.error('Failed to delete notification');
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await fetcher.post('/api/provider/notifications/mark-all-read', {});
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setTotalUnread(0);
      toast.success('All notifications marked as read');
    } catch (error) {
      console.error('Failed to mark all as read:', error);
      toast.error('Failed to mark all as read');
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative min-h-[44px] min-w-[44px] touch-manipulation"
        >
          <Bell className="w-5 h-5" />
          {totalUnread > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 min-w-5 px-1.5 flex items-center justify-center text-xs"
            >
              {totalUnread > 99 ? '99+' : totalUnread}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[95vw] sm:w-96 p-0 max-h-[85vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-3 sm:p-4 border-b sticky top-0 bg-white z-10">
          <h3 className="font-semibold text-base sm:text-lg">Notifications</h3>
          <div className="flex items-center gap-2">
            {totalUnread > 0 && (
              <>
                <Badge variant="secondary" className="text-xs">
                  {totalUnread} new
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleMarkAllRead}
                  className="text-xs h-7 px-2 min-h-[28px] touch-manipulation"
                >
                  Mark all read
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setOpen(false)}
              className="h-7 w-7 min-h-[28px] min-w-[28px] touch-manipulation"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-8 text-center text-gray-500">
              <Clock className="w-8 h-8 mx-auto mb-2 animate-spin" />
              <p className="text-sm">Loading notifications...</p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-gray-400" />
              <p className="text-sm">No new notifications</p>
              <Link
                href="/provider/settings/notifications"
                className="text-xs text-[#FF0077] hover:underline mt-2 inline-block"
                onClick={() => setOpen(false)}
              >
                Manage notifications
              </Link>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => {
                const Icon = getNotificationIcon(
                  notification.type,
                  notification.metadata || notification.data
                );
                const isExpanded = expandedId === notification.id;
                const derivedUrl = deriveNotificationUrl(notification);
                return (
                  <div key={notification.id}>
                    <div
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          void handleNotificationClick(notification);
                        }
                      }}
                      onClick={() => void handleNotificationClick(notification)}
                      className={cn(
                        "w-full text-left p-3 sm:p-4 hover:bg-gray-50 transition-colors cursor-pointer",
                        !notification.read && "bg-blue-50/50"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={cn(
                            "p-2 rounded-lg border flex-shrink-0",
                            getPriorityColor(notification.priority)
                          )}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <p className={cn(
                              "font-medium text-sm text-gray-900",
                              !notification.read && "font-semibold"
                            )}>
                              {notification.title}
                            </p>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {!notification.read && (
                                <span className="w-2 h-2 bg-[#FF0077] rounded-full mt-1.5" />
                              )}
                              <button
                                type="button"
                                onClick={(e) => handleDeleteNotification(e, notification.id)}
                                className="p-1 text-gray-400 hover:text-red-500 transition-colors rounded"
                                title="Delete notification"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                          <p className={cn("text-sm text-gray-600 mb-1", !isExpanded && "line-clamp-2")}>
                            {notification.message}
                          </p>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">
                              {formatTimeAgo(notification.timestamp)}
                            </span>
                            {!derivedUrl && (
                              <span className="text-xs text-gray-400">
                                {isExpanded ? <ChevronUp className="w-3 h-3 inline" /> : <ChevronDown className="w-3 h-3 inline" />}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    {isExpanded && !derivedUrl && (
                      <div className="px-4 pb-3 pt-0 ml-12 text-xs text-gray-500 space-y-1 border-b">
                        <p className="text-gray-600">{notification.message}</p>
                        {notification.metadata && Object.keys(notification.metadata).length > 0 && (
                          <div className="text-gray-400 space-y-0.5">
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
          )}
        </div>
        
        <div className="p-3 border-t bg-gray-50 sticky bottom-0">
          <Link
            href="/provider/notifications"
            className="text-sm text-[#FF0077] hover:underline text-center block"
            onClick={() => setOpen(false)}
          >
            View all notifications
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
