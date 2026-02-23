"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/AuthProvider";
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
} from "lucide-react";
import { PageHeader } from "@/components/provider/PageHeader";
import { SectionCard } from "@/components/provider/SectionCard";
import { Button } from "@/components/ui/button";
import { fetcher } from "@/lib/http/fetcher";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import LoadingTimeout from "@/components/ui/loading-timeout";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  timestamp: string;
  link?: string;
  priority: "low" | "medium" | "high";
  read: boolean;
  metadata?: Record<string, unknown>;
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

export default function ProviderNotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [totalUnread, setTotalUnread] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const { user } = useAuth();

  const loadNotifications = async () => {
    try {
      setIsLoading(true);
      const response = await fetcher.get<{ data?: { notifications: Notification[]; total_unread: number } }>(
        "/api/provider/notifications?limit=100"
      );
      const data = response.data ?? response;
      setNotifications((data as any).notifications || []);
      setTotalUnread((data as any).total_unread || 0);
    } catch (error) {
      console.error("Failed to load notifications:", error);
      toast.error("Failed to load notifications");
      setNotifications([]);
      setTotalUnread(0);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user?.id) {
      loadNotifications();
    } else {
      setIsLoading(false);
    }
  }, [user?.id]);

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.read) {
      try {
        await fetcher.post(`/api/provider/notifications/${notification.id}/read`);
        setNotifications((prev) =>
          prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n))
        );
        setTotalUnread((prev) => Math.max(0, prev - 1));
      } catch (error) {
        console.error("Failed to mark notification as read:", error);
      }
    }
    if (notification.link) {
      router.push(notification.link);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await fetcher.post("/api/provider/notifications/mark-all-read");
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setTotalUnread(0);
      toast.success("All notifications marked as read");
    } catch (error) {
      console.error("Failed to mark all as read:", error);
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
        {isLoading ? (
          <div className="py-12">
            <LoadingTimeout loadingMessage="Loading notifications..." />
          </div>
        ) : notifications.length === 0 ? (
          <div className="py-12 text-center text-gray-500">
            <CheckCircle2 className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <p className="text-base font-medium mb-2">No new notifications</p>
            <Link
              href="/provider/settings/notifications"
              className="text-sm text-[#FF0077] hover:underline"
            >
              Manage notifications
            </Link>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-600">
                {totalUnread > 0 ? `${totalUnread} unread` : "All caught up"}
              </p>
              {totalUnread > 0 && (
                <Button variant="outline" size="sm" onClick={handleMarkAllRead}>
                  Mark all read
                </Button>
              )}
            </div>
            <div className="divide-y">
              {notifications.map((notification) => {
                const Icon = getNotificationIcon(notification.type);
                return (
                  <button
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    className={cn(
                      "w-full text-left p-4 hover:bg-gray-50 transition-colors",
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
                          <p
                            className={cn(
                              "font-medium text-sm text-gray-900",
                              !notification.read && "font-semibold"
                            )}
                          >
                            {notification.title}
                          </p>
                          {!notification.read && (
                            <span className="w-2 h-2 bg-[#FF0077] rounded-full flex-shrink-0 mt-1.5" />
                          )}
                        </div>
                        <p className="text-sm text-gray-600 line-clamp-2 mb-1">{notification.message}</p>
                        <span className="text-xs text-gray-500">{formatTimeAgo(notification.timestamp)}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </SectionCard>

      <div className="text-center">
        <Link
          href="/provider/settings/notifications"
          className="text-sm text-[#FF0077] hover:underline"
        >
          Manage notifications
        </Link>
      </div>
    </div>
  );
}
