"use client";

import Link from "next/link";
import {
  Plus,
  UserRound,
  Users,
  Clock,
  ShoppingBag,
  DoorOpen,
  ListOrdered,
  Home,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";
import { openCreateMode, openGroupSheet, openWalkInSaleSheet } from "@/stores/appointment-sidebar-store";
import { useFeatureFlag } from "@/providers/ConfigBundleProvider";
import { FEATURE_FLAG_KEYS } from "@/lib/server/feature-flag-keys";
import { useProviderBookingMobileShell } from "../hooks/useProviderBookingMobileShell";
import { MIN_TAP } from "../tokens";

interface BookingsQuickActionsProps {
  selectedDate: Date;
  waitingRoomCount?: number;
  onWalkIn?: () => void;
  onWaitlistQuickBook?: () => void;
}

export function BookingsQuickActions({
  selectedDate,
  waitingRoomCount = 0,
  onWalkIn,
  onWaitlistQuickBook,
}: BookingsQuickActionsProps) {
  const unifiedPos = useFeatureFlag(FEATURE_FLAG_KEYS.PROVIDER_UNIFIED_POS);
  const mobileShell = useProviderBookingMobileShell();
  const { hasPermission, isOwner } = usePermissions();
  const canCreateAppointments = isOwner || hasPermission("create_appointments");

  const dateStr = selectedDate.toISOString().split("T")[0];

  const guardCreate = (action: () => void) => {
    if (!canCreateAppointments) return;
    action();
  };

  const actions = [
    {
      id: "new",
      label: "New",
      sub: "Booking",
      icon: Plus,
      requiresCreate: true,
      onClick: () =>
        guardCreate(() =>
          openCreateMode({ staffId: "", date: dateStr, startTime: "09:00" }),
        ),
    },
    {
      id: "walk-in",
      label: "Walk-in",
      sub: "Quick book",
      icon: UserRound,
      requiresCreate: true,
      onClick: () => {
        guardCreate(() => {
          if (onWalkIn) {
            onWalkIn();
            return;
          }
          openCreateMode({
            staffId: "",
            date: dateStr,
            startTime: new Date().toTimeString().slice(0, 5),
            appointmentKind: "walk_in",
          });
        });
      },
    },
    {
      id: "group",
      label: "Group",
      sub: "Session",
      icon: Users,
      requiresCreate: true,
      onClick: () => guardCreate(() => openGroupSheet()),
    },
    {
      id: "house-call",
      label: "House",
      sub: "Call",
      icon: Home,
      requiresCreate: true,
      onClick: () =>
        guardCreate(() =>
          openCreateMode({
            staffId: "",
            date: dateStr,
            startTime: "09:00",
            appointmentKind: "at_home",
          }),
        ),
    },
    {
      id: "block",
      label: "Block",
      sub: "Time",
      icon: Clock,
      href: "/provider/time-blocks",
    },
    {
      id: "sell",
      label: unifiedPos ? "POS" : "Sell",
      sub: "Products",
      icon: ShoppingBag,
      href: mobileShell ? undefined : unifiedPos ? "/provider/sales" : "/provider/ecommerce/walk-in",
      onClick: mobileShell
        ? () => openWalkInSaleSheet()
        : undefined,
    },
    {
      id: "waitlist",
      label: "Waitlist",
      sub: "Quick book",
      icon: ListOrdered,
      onClick: () => {
        if (onWaitlistQuickBook) {
          onWaitlistQuickBook();
          return;
        }
      },
      href: onWaitlistQuickBook ? undefined : "/provider/waitlist",
    },
    {
      id: "front-desk",
      label: "Front desk",
      sub: waitingRoomCount > 0 ? `${waitingRoomCount} waiting` : "Today",
      icon: DoorOpen,
      href: "/provider/front-desk",
    },
  ];

  return (
    <div className="flex gap-2 px-4 pb-3 overflow-x-auto snap-x">
      {actions.map((action) => {
        const Icon = action.icon;
        const inner = (
          <>
            <Icon className="h-5 w-5 text-gray-700" />
            <span className="text-xs font-semibold text-gray-900 mt-1">{action.label}</span>
            <span className="text-[10px] text-gray-500">{action.sub}</span>
          </>
        );
        const className = cn(
          "flex flex-col items-center justify-center min-w-[72px] h-[72px] rounded-2xl border border-gray-200 bg-white snap-start touch-manipulation shadow-sm",
          MIN_TAP,
          action.requiresCreate && !canCreateAppointments && "opacity-40 pointer-events-none",
        );
        if (action.href) {
          return (
            <Link key={action.id} href={action.href} className={className}>
              {inner}
            </Link>
          );
        }
        return (
          <button key={action.id} type="button" onClick={action.onClick} className={className}>
            {inner}
          </button>
        );
      })}
    </div>
  );
}
