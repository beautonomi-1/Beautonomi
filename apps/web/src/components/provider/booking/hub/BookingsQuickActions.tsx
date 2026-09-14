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
import { useTranslation } from "@beautonomi/i18n";
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
  const { t } = useTranslation();
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
      label: t("web.provider.bookings.hubQuickActions.new"),
      sub: t("web.provider.bookings.hubQuickActions.booking"),
      icon: Plus,
      requiresCreate: true,
      onClick: () =>
        guardCreate(() =>
          openCreateMode({ staffId: "", date: dateStr, startTime: "09:00" }),
        ),
    },
    {
      id: "walk-in",
      label: t("web.provider.bookings.hubQuickActions.walkIn"),
      sub: t("web.provider.bookings.hubQuickActions.quickBook"),
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
      label: t("web.provider.bookings.hubQuickActions.group"),
      sub: t("web.provider.bookings.hubQuickActions.session"),
      icon: Users,
      requiresCreate: true,
      onClick: () => guardCreate(() => openGroupSheet()),
    },
    {
      id: "house-call",
      label: t("web.provider.bookings.hubQuickActions.house"),
      sub: t("web.provider.bookings.hubQuickActions.call"),
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
      label: t("web.provider.bookings.hubQuickActions.block"),
      sub: t("web.provider.bookings.hubQuickActions.time"),
      icon: Clock,
      href: "/provider/time-blocks",
    },
    {
      id: "sell",
      label: unifiedPos ? t("web.provider.bookings.hubQuickActions.pos") : t("web.provider.bookings.hubQuickActions.sell"),
      sub: t("web.provider.bookings.hubQuickActions.products"),
      icon: ShoppingBag,
      href: mobileShell ? undefined : unifiedPos ? "/provider/sales" : "/provider/ecommerce/walk-in",
      onClick: mobileShell
        ? () => openWalkInSaleSheet()
        : undefined,
    },
    {
      id: "waitlist",
      label: t("web.provider.bookings.hubQuickActions.waitlist"),
      sub: t("web.provider.bookings.hubQuickActions.quickBook"),
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
      label: t("web.provider.bookings.hubQuickActions.frontDesk"),
      sub:
        waitingRoomCount > 0
          ? t("web.provider.bookings.hubQuickActions.waitingCount", { count: waitingRoomCount })
          : t("web.provider.common.dateRange.today"),
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
