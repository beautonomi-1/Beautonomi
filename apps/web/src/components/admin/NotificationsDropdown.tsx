"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  X,
  DollarSign,
  ShieldCheck,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  AlertTriangle,
  CreditCard,
  RefreshCw,
  TrendingUp,
  UserX,
  Ban,
  Zap,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { fetcher } from "@/lib/http/fetcher";
import { cn } from "@/lib/utils";

interface Activity {
  id: string;
  type: string;
  title: string;
  message: string;
  timestamp: string;
  link: string;
  priority: 'low' | 'medium' | 'high';
}

interface ActivityResponse {
  activities: Activity[];
  counts: {
    pending_payouts: number;
    pending_verifications: number;
    pending_provider_approvals: number;
  };
  total_unread: number;
}

const getActivityIcon = (type: string) => {
  switch (type) {
    case 'payout_request':
      return DollarSign;
    case 'verification':
      return ShieldCheck;
    case 'provider_approval':
    case 'new_provider':
      return Building2;
    case 'booking':
      return Calendar;
    case 'webhook_failure':
      return Zap;
    case 'payment_failure':
      return CreditCard;
    case 'refund_request':
      return RefreshCw;
    case 'high_value_transaction':
      return TrendingUp;
    case 'provider_violation':
      return Ban;
    case 'account_issue':
      return UserX;
    case 'dispute':
      return AlertTriangle;
    default:
      return Bell;
  }
};

const getPriorityColor = (priority: string) => {
  switch (priority) {
    case 'high':
      return 'text-red-600 bg-red-50';
    case 'medium':
      return 'text-yellow-600 bg-yellow-50';
    default:
      return 'text-blue-600 bg-blue-50';
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

export default function NotificationsDropdown() {
  const [open, setOpen] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [totalUnread, setTotalUnread] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // Load activities on mount
    loadActivities();
    
    // Refresh every 2 minutes
    const interval = setInterval(loadActivities, 120000);
    
    // If popover is open, refresh more frequently (every 30 seconds)
    let fastInterval: NodeJS.Timeout | null = null;
    if (open) {
      fastInterval = setInterval(loadActivities, 30000);
    }
    
    return () => {
      clearInterval(interval);
      if (fastInterval) clearInterval(fastInterval);
    };
  }, [open]);

  const loadActivities = async () => {
    try {
      setIsLoading(true);
      const response = await fetcher.get<{ data?: ActivityResponse } & ActivityResponse>('/api/admin/activity');
      const data = response.data ?? response;
      setActivities(data.activities || []);
      setTotalUnread(data.total_unread || 0);
    } catch (error) {
      console.error('Failed to load activities:', error);
      setActivities([]);
      setTotalUnread(0);
    } finally {
      setIsLoading(false);
    }
  };

  const handleActivityClick = (link: string) => {
    setOpen(false);
    router.push(link);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="relative p-2 hover:bg-gray-100 rounded-lg">
          <Bell className="w-5 h-5 text-gray-600" />
          {totalUnread > 0 && (
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
          )}
          {totalUnread > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 min-w-5 px-1.5 flex items-center justify-center text-xs"
            >
              {totalUnread > 99 ? '99+' : totalUnread}
            </Badge>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold text-lg">Notifications</h3>
          <div className="flex items-center gap-2">
            {totalUnread > 0 && (
              <Badge variant="secondary" className="text-xs">
                {totalUnread} new
              </Badge>
            )}
            <button
              onClick={() => setOpen(false)}
              className="p-1 hover:bg-gray-100 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        
        <div className="max-h-[500px] overflow-y-auto">
          {isLoading ? (
            <div className="p-8 text-center text-gray-500">
              <Clock className="w-8 h-8 mx-auto mb-2 animate-spin" />
              <p className="text-sm">Loading notifications...</p>
            </div>
          ) : activities.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-gray-400" />
              <p className="text-sm">No new notifications</p>
              <Link
                href="/admin/notifications"
                className="text-xs text-blue-600 hover:underline mt-2 inline-block"
                onClick={() => setOpen(false)}
              >
                Manage notifications
              </Link>
            </div>
          ) : (
            <div className="divide-y">
              {activities.map((activity) => {
                const Icon = getActivityIcon(activity.type);
                return (
                  <button
                    key={activity.id}
                    onClick={() => handleActivityClick(activity.link)}
                    className="w-full text-left p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          "p-2 rounded-lg",
                          getPriorityColor(activity.priority)
                        )}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <p className="font-medium text-sm text-gray-900">
                            {activity.title}
                          </p>
                          <span className="text-xs text-gray-500 ml-2">
                            {formatTimeAgo(activity.timestamp)}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 line-clamp-2">
                          {activity.message}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        
        <div className="p-3 border-t bg-gray-50">
          <Link
            href="/admin/notifications"
            className="text-sm text-blue-600 hover:underline text-center block"
            onClick={() => setOpen(false)}
          >
            View all notifications
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
