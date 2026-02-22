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

export function ProviderNotificationsDropdown() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [totalUnread, setTotalUnread] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    loadNotifications();
    
    // Set up real-time subscription for notifications
    const supabase = getSupabaseClient();
    let subscription: any = null;

    if (user?.id) {
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
                link: newNotification.link || undefined,
                priority: (newNotification.priority || 'low') as 'low' | 'medium' | 'high',
                read: newNotification.is_read || false,
                metadata: newNotification.metadata,
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
    
    // Fallback: Refresh every 5 minutes as backup (reduced from 2 minutes)
    const interval = setInterval(loadNotifications, 300000);
    
    return () => {
      if (subscription) {
        try {
          supabase.removeChannel(subscription);
        } catch {
          // Ignore when channel is still connecting (e.g. React Strict Mode unmount)
        }
      }
      clearInterval(interval);
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
    // Mark as read
    if (!notification.read) {
      try {
        await fetcher.post(`/api/provider/notifications/${notification.id}/read`);
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
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await fetcher.post('/api/provider/notifications/mark-all-read');
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
