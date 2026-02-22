"use client";

import React from "react";
import { cn } from "@/lib/utils";
import {
  Calendar,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Star,
  ArrowRight,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  XCircle,
  UserPlus,
  CalendarPlus,
  MessageSquare,
  Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { isToday, parseISO } from "date-fns";
import Link from "next/link";

// Types
interface UpcomingAppointment {
  id: string;
  client_name: string;
  client_avatar?: string;
  service_name: string;
  scheduled_date: string;
  scheduled_time: string;
  duration_minutes: number;
  status: string;
  team_member_name?: string;
}

interface _QuickStat {
  label: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
}

// Stat Card with Gradient
interface GradientStatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  gradient: "pink" | "blue" | "green" | "purple" | "orange";
  trend?: number;
}

export function GradientStatCard({
  title,
  value,
  subtitle,
  icon,
  gradient,
  trend,
}: GradientStatCardProps) {
  const gradients = {
    pink: "from-[#FF0077] to-[#FF6B35]",
    blue: "from-blue-500 to-cyan-400",
    green: "from-emerald-500 to-teal-400",
    purple: "from-purple-500 to-pink-400",
    orange: "from-orange-500 to-amber-400",
  };

  return (
    <div className="relative overflow-hidden rounded-xl bg-white border p-4 sm:p-5">
      {/* Background decoration */}
      <div
        className={cn(
          "absolute -right-4 -top-4 w-24 h-24 rounded-full opacity-10 bg-gradient-to-br",
          gradients[gradient]
        )}
      />
      <div
        className={cn(
          "absolute -right-2 -bottom-8 w-16 h-16 rounded-full opacity-5 bg-gradient-to-br",
          gradients[gradient]
        )}
      />

      <div className="relative">
        <div className="flex items-start justify-between mb-3">
          <div
            className={cn(
              "p-2.5 rounded-xl bg-gradient-to-br text-white",
              gradients[gradient]
            )}
          >
            {icon}
          </div>
          {trend !== undefined && (
            <div
              className={cn(
                "flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full",
                trend >= 0
                  ? "bg-green-50 text-green-600"
                  : "bg-red-50 text-red-600"
              )}
            >
              {trend >= 0 ? (
                <TrendingUp className="w-3 h-3" />
              ) : (
                <TrendingDown className="w-3 h-3" />
              )}
              {Math.abs(trend)}%
            </div>
          )}
        </div>
        <h3 className="text-2xl sm:text-3xl font-bold text-gray-900">{value}</h3>
        <p className="text-sm text-gray-500 mt-1">{title}</p>
        {subtitle && (
          <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
        )}
      </div>
    </div>
  );
}

// Upcoming Appointments Widget
interface UpcomingAppointmentsWidgetProps {
  appointments: UpcomingAppointment[];
  maxItems?: number;
  onViewAll?: () => void;
}

export function UpcomingAppointmentsWidget({
  appointments,
  maxItems = 5,
  onViewAll,
}: UpcomingAppointmentsWidgetProps) {
  const displayAppointments = appointments.slice(0, maxItems);

  const formatTime12h = (time: string) => {
    const [hour, minute] = time.split(":").map(Number);
    const ampm = hour >= 12 ? "PM" : "AM";
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minute.toString().padStart(2, "0")} ${ampm}`;
  };

  const _getStatusColor = (status: string) => {
    switch (status) {
      case "confirmed":
        return "bg-blue-100 text-blue-700";
      case "pending":
        return "bg-amber-100 text-amber-700";
      case "in_progress":
        return "bg-purple-100 text-purple-700";
      case "completed":
        return "bg-green-100 text-green-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  return (
    <div className="bg-white rounded-xl border p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-gray-900">Upcoming Appointments</h3>
        <Link href="/provider/calendar">
          <Button variant="ghost" size="sm" className="text-[#FF0077] hover:text-[#D60565]">
            View Calendar
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </Link>
      </div>

      {displayAppointments.length === 0 ? (
        <div className="text-center py-8">
          <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No upcoming appointments</p>
          <Link href="/provider/calendar">
            <Button variant="outline" size="sm" className="mt-3">
              <CalendarPlus className="w-4 h-4 mr-2" />
              Schedule One
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {displayAppointments.map((apt) => {
            const isAppointmentToday = isToday(parseISO(apt.scheduled_date));
            
            return (
              <Link
                key={apt.id}
                href={`/provider/calendar?date=${apt.scheduled_date}&appointment=${apt.id}`}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors group"
              >
                <Avatar className="w-10 h-10 flex-shrink-0">
                  <AvatarImage src={apt.client_avatar} />
                  <AvatarFallback className="bg-[#FF0077]/10 text-[#FF0077] text-sm font-medium">
                    {apt.client_name.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900 truncate">
                      {apt.client_name}
                    </p>
                    {isAppointmentToday && (
                      <Badge variant="secondary" className="bg-[#FF0077]/10 text-[#FF0077] text-[10px]">
                        TODAY
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 truncate">{apt.service_name}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-medium text-gray-900">
                    {formatTime12h(apt.scheduled_time)}
                  </p>
                  <p className="text-xs text-gray-400">
                    {apt.duration_minutes} min
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
              </Link>
            );
          })}
        </div>
      )}

      {appointments.length > maxItems && (
        <div className="mt-3 pt-3 border-t">
          <Button
            variant="ghost"
            className="w-full text-[#FF0077] hover:bg-[#FF0077]/5"
            onClick={onViewAll}
          >
            View All ({appointments.length})
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      )}
    </div>
  );
}

// Quick Actions Widget
interface QuickActionsWidgetProps {
  onNewAppointment?: () => void;
  onNewClient?: () => void;
  onNewSale?: () => void;
  onMessages?: () => void;
}

export function QuickActionsWidget({
  onNewAppointment,
  onNewClient,
  onNewSale,
  onMessages,
}: QuickActionsWidgetProps) {
  const actions = [
    {
      label: "New Appointment",
      icon: CalendarPlus,
      color: "bg-[#FF0077] hover:bg-[#D60565]",
      onClick: onNewAppointment,
      href: "/provider/calendar",
    },
    {
      label: "Add Client",
      icon: UserPlus,
      color: "bg-blue-500 hover:bg-blue-600",
      onClick: onNewClient,
      href: "/provider/clients/new",
    },
    {
      label: "New Sale",
      icon: DollarSign,
      color: "bg-green-500 hover:bg-green-600",
      onClick: onNewSale,
      href: "/provider/sales/new",
    },
    {
      label: "Messages",
      icon: MessageSquare,
      color: "bg-purple-500 hover:bg-purple-600",
      onClick: onMessages,
      href: "/provider/inbox",
    },
  ];

  return (
    <div className="bg-white rounded-xl border p-4 sm:p-5">
      <h3 className="text-lg font-bold text-gray-900 mb-4">Quick Actions</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Link key={action.label} href={action.href}>
              <button
                className={cn(
                  "w-full flex flex-col items-center gap-2 p-4 rounded-xl text-white transition-all",
                  "hover:scale-105 active:scale-95",
                  action.color
                )}
                onClick={(e) => {
                  if (action.onClick) {
                    e.preventDefault();
                    action.onClick();
                  }
                }}
              >
                <Icon className="w-6 h-6" />
                <span className="text-xs font-medium text-center">
                  {action.label}
                </span>
              </button>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// Performance Overview Widget
interface PerformanceOverviewProps {
  completionRate: number;
  noShowRate: number;
  cancellationRate: number;
  averageRating: number;
  totalReviews: number;
}

export function PerformanceOverviewWidget({
  completionRate,
  noShowRate,
  cancellationRate,
  averageRating,
  totalReviews,
}: PerformanceOverviewProps) {
  return (
    <div className="bg-white rounded-xl border p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-gray-900">Performance</h3>
        <Link href="/provider/reports">
          <Button variant="ghost" size="sm" className="text-gray-500 hover:text-gray-700">
            View Reports
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </Link>
      </div>

      <div className="space-y-4">
        {/* Rating */}
        <div className="flex items-center gap-4 p-3 rounded-lg bg-gradient-to-r from-amber-50 to-orange-50">
          <div className="flex items-center gap-1">
            <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
            <span className="text-2xl font-bold text-gray-900">
              {averageRating.toFixed(1)}
            </span>
          </div>
          <div className="text-sm text-gray-600">
            Based on {totalReviews} reviews
          </div>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-3 rounded-lg bg-green-50">
            <CheckCircle2 className="w-5 h-5 text-green-600 mx-auto mb-1" />
            <p className="text-lg font-bold text-green-700">{completionRate}%</p>
            <p className="text-xs text-green-600">Completion</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-amber-50">
            <AlertCircle className="w-5 h-5 text-amber-600 mx-auto mb-1" />
            <p className="text-lg font-bold text-amber-700">{noShowRate}%</p>
            <p className="text-xs text-amber-600">No Shows</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-red-50">
            <XCircle className="w-5 h-5 text-red-600 mx-auto mb-1" />
            <p className="text-lg font-bold text-red-700">{cancellationRate}%</p>
            <p className="text-xs text-red-600">Cancelled</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Today's Summary Widget
interface TodaySummaryProps {
  appointmentsToday: number;
  completedToday: number;
  revenueToday: number;
  pendingCheckouts: number;
}

export function TodaySummaryWidget({
  appointmentsToday,
  completedToday,
  revenueToday,
  pendingCheckouts,
}: TodaySummaryProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: "ZAR",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="bg-gradient-to-br from-[#1a1f3c] to-[#2d3561] rounded-xl p-4 sm:p-5 text-white">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-5 h-5 text-[#FF0077]" />
        <h3 className="text-lg font-bold">Today's Summary</h3>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-3xl font-bold">{appointmentsToday}</p>
          <p className="text-sm text-gray-400">Total Appointments</p>
        </div>
        <div>
          <p className="text-3xl font-bold text-green-400">
            {completedToday}
          </p>
          <p className="text-sm text-gray-400">Completed</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-[#FF0077]">
            {formatCurrency(revenueToday)}
          </p>
          <p className="text-sm text-gray-400">Revenue</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-amber-400">{pendingCheckouts}</p>
          <p className="text-sm text-gray-400">Pending Checkouts</p>
        </div>
      </div>

      {pendingCheckouts > 0 && (
        <Link href="/provider/sales/pending">
          <Button
            variant="secondary"
            className="w-full mt-4 bg-white/10 hover:bg-white/20 text-white border-0"
          >
            Complete Checkouts
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </Link>
      )}
    </div>
  );
}

// Welcome Banner
interface WelcomeBannerProps {
  providerName: string;
  businessName?: string;
  setupProgress?: number;
}

export function WelcomeBanner({
  providerName,
  businessName,
  setupProgress,
}: WelcomeBannerProps) {
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="relative overflow-hidden bg-gradient-to-r from-[#FF0077] via-[#FF4D6D] to-[#FF6B35] rounded-xl p-5 sm:p-6 text-white mb-6">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-10">
        <div
          className="absolute -right-20 -top-20 w-64 h-64 rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(255,255,255,0.3) 0%, transparent 70%)",
          }}
        />
        <div
          className="absolute -left-10 -bottom-10 w-48 h-48 rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(255,255,255,0.2) 0%, transparent 70%)",
          }}
        />
      </div>

      <div className="relative">
        <p className="text-white/80 text-sm mb-1">{greeting},</p>
        <h1 className="text-2xl sm:text-3xl font-bold mb-1">
          {providerName}
        </h1>
        {businessName && (
          <p className="text-white/80">{businessName}</p>
        )}

        {setupProgress !== undefined && setupProgress < 100 && (
          <div className="mt-4 p-3 bg-white/10 rounded-lg backdrop-blur-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Profile Setup</span>
              <span className="text-sm font-bold">{setupProgress}%</span>
            </div>
            <div className="h-2 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-white rounded-full transition-all duration-500"
                style={{ width: `${setupProgress}%` }}
              />
            </div>
            <Link href="/provider/settings">
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 text-white hover:bg-white/20 p-0 h-auto"
              >
                Complete Setup
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
