"use client";

import React, { useState, useEffect } from "react";
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
} from "lucide-react";
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

export function CustomerNotificationsDropdown() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [totalUnread, setTotalUnread] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    loadNotifications();

    // Refresh every 2 minutes
    const interval = setInterval(loadNotifications, 120000);

    // If popover is open, refresh more frequently (every 30 seconds)
    let fastInterval: NodeJS.Timeout | null = null;
    if (open) {
      fastInterval = setInterval(loadNotifications, 30000);
    }

    return () => {
      clearInterval(interval);
      if (fastInterval) clearInterval(fastInterval);
    };
  }, [open]);

  const loadNotifications = async () => {
    try {
      setIsLoading(true);
      const response = await fetcher.get<{ data?: NotificationResponse } & NotificationResponse>('/api/me/notifications');
      const data = response.data ?? response;
      setNotifications(data.notifications || []);
      setTotalUnread(data.total_unread || 0);
    } catch (error) {
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
    // Mark as read
    if (!notification.read) {
      try {
        await fetcher.post(`/api/me/notifications/${notification.id}/read`);
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === notification.id ? { ...n, read: true } : n
          )
        );
        setTotalUnread((prev) => Math.max(0, prev - 1));
      } catch (error) {
        console.error('Failed to mark notification as read:', error);
      }
    }

    // Navigate if link exists
    if (notification.link) {
      setOpen(false);
      router.push(notification.link);
    } else if (notification.metadata?.conversation_id) {
      // Handle message notifications
      setOpen(false);
      router.push(`/account-settings/messages?conversation=${notification.metadata.conversation_id}`);
    } else if (notification.metadata?.request_id) {
      // Handle custom request/offer notifications
      setOpen(false);
      router.push('/account-settings/custom-requests');
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await fetcher.post('/api/me/notifications/mark-all-read');
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
                href="/account-settings/notifications"
                className="text-xs text-[#FF0077] hover:underline mt-2 inline-block"
                onClick={() => setOpen(false)}
              >
                Manage notifications
              </Link>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => {
                const Icon = getNotificationIcon(notification.type);
                return (
                  <button
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    className={cn(
                      "w-full text-left p-3 sm:p-4 hover:bg-gray-50 transition-colors",
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
                          {!notification.read && (
                            <span className="w-2 h-2 bg-[#FF0077] rounded-full flex-shrink-0 mt-1.5" />
                          )}
                        </div>
                        <p className="text-sm text-gray-600 line-clamp-2 mb-1">
                          {notification.message}
                        </p>
                        <span className="text-xs text-gray-500">
                          {formatTimeAgo(notification.timestamp)}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        
        <div className="p-3 border-t bg-gray-50 sticky bottom-0">
          <Link
            href="/account-settings/notifications"
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
