"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import type { FrontDeskBooking } from "@/lib/front-desk/types";
import {
  Loader2,
  MessageCircle,
  MoreVertical,
  Clock,
} from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  checkInBooking,
  arriveAtHome,
  startService,
  markReadyToPay,
} from "@/lib/front-desk/actions";

/** Desaturated status pills - matches reference (lavender for in_service, etc.) */
const BADGE_STYLES: Record<string, string> = {
  late: "bg-rose-50 text-rose-700",
  arriving: "bg-sky-50 text-sky-700",
  checked_in: "bg-emerald-50 text-emerald-700",
  in_service: "bg-indigo-100 text-indigo-700",
  ready_to_pay: "bg-amber-50 text-amber-700",
  completed: "bg-emerald-50 text-emerald-600",
  cancelled: "bg-slate-100 text-slate-500",
  confirmed: "bg-slate-100 text-slate-600",
};

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";
}

function formatTime(date: Date | string): string {
  return new Date(date).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

interface BookingTileProps {
  booking: FrontDeskBooking;
  isSelected: boolean;
  onClick: () => void;
  onActionComplete?: () => void;
  isLoading?: boolean;
}

export function BookingTile({
  booking,
  isSelected,
  onClick,
  onActionComplete,
  isLoading,
}: BookingTileProps) {
  const name = booking.customer_name || "Customer";
  const badge = booking.operationalBadge || "confirmed";
  const locationType = (booking as any).location_type as string | undefined;
  const isAtHome = locationType === "at_home";

  // Combine services and products for display
  const serviceNames = (booking.services || [])
    .map((s: any) => s.offering_name || s.service_name || s.name || "Service")
    .filter(Boolean);
  const productNames = (booking.products || [])
    .map((p: any) => `${p.product_name || "Product"}${(p.quantity || 1) > 1 ? ` ×${p.quantity}` : ""}`)
    .filter(Boolean);
  const hasProducts = productNames.length > 0;
  const servicesAndProducts = [...serviceNames, ...productNames].slice(0, 3);
  const servicesProductsLabel = servicesAndProducts.length > 0 ? servicesAndProducts.join(" + ") : "—";

  const paid =
    (booking as any).payment_status === "paid" ||
    ((booking as any).total_paid || 0) >= (booking.total_amount || 0);

  const runQuickAction = async (fn: () => Promise<boolean>) => {
    const ok = await fn();
    if (ok) onActionComplete?.();
  };

  const getQuickActions = (): Array<{ label: string; onClick: () => void }> => {
    const actions: Array<{ label: string; onClick: () => void }> = [];
    if (["completed", "cancelled"].includes(badge)) return actions;
    if (badge === "confirmed") {
      if (isAtHome) {
        actions.push({ label: "I've Arrived", onClick: () => runQuickAction(() => arriveAtHome(booking.id)) });
      } else {
        actions.push({
          label: "Check in",
          onClick: () => runQuickAction(() => checkInBooking(booking.id, (booking as any).version)),
        });
      }
    }
    if (["checked_in", "arriving", "late"].includes(badge)) {
      actions.push({ label: "Start service", onClick: () => runQuickAction(() => startService(booking.id)) });
    }
    if (badge === "in_service") {
      actions.push({ label: "Ready to pay", onClick: () => runQuickAction(() => markReadyToPay(booking.id)) });
    }
    return actions;
  };

  const quickActions = getQuickActions();
  const [isMessaging, setIsMessaging] = useState(false);

  const handleMessage = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const customerId = (booking as any).customer_id;
    if (!customerId) {
      toast.error("Customer not found for this booking.");
      return;
    }
    setIsMessaging(true);
    try {
      const data = await fetcher.post<{ data?: { id: string } }>("/api/provider/conversations/create", {
        customer_id: customerId,
        booking_id: booking.id,
      });
      const convId = data?.data?.id;
      if (convId) {
        window.location.assign(`/provider/messaging?conversationId=${convId}`);
      } else {
        toast.error("Could not open conversation.");
        setIsMessaging(false);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to open conversation.";
      toast.error(msg);
      setIsMessaging(false);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={isLoading ? () => {} : onClick}
      onKeyDown={(e) => !isLoading && e.key === "Enter" && onClick()}
      className={cn(
        "group relative transition-all duration-300 rounded-[1.5rem] min-h-[192px] p-5 flex flex-col",
        "bg-white border",
        "shadow-sm hover:shadow-md",
        "active:scale-[0.99]",
        isSelected
          ? "border-black ring-1 ring-black shadow-xl bg-white"
          : "border-transparent",
        isLoading ? "cursor-wait opacity-80" : "cursor-pointer"
      )}
    >
      {/* Row 1: Identity (Left) + Status Pill (Right) */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="flex shrink-0 w-11 h-11 rounded-lg bg-slate-100 flex items-center justify-center font-semibold text-slate-600 text-sm tabular-nums">
            {getInitials(name)}
          </div>
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold text-slate-900 truncate">{name}</h3>
            <p className="flex items-center gap-1.5 text-[13px] text-slate-400 mt-0.5">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              {formatTime(booking.scheduled_at)}
            </p>
          </div>
        </div>
        <span
          className={cn(
            "shrink-0 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider",
            BADGE_STYLES[badge] || BADGE_STYLES.confirmed
          )}
        >
          {badge.replace(/_/g, " ")}
        </span>
      </div>

      {/* Thin Line */}
      <div className="my-4 border-t border-slate-100" />

      {/* SERVICE Label + Service Name */}
      <div className="flex-1 min-h-0">
        <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
          {hasProducts && serviceNames.length > 0 ? "SERVICE & PRODUCTS" : hasProducts ? "PRODUCTS" : "SERVICE"}
        </p>
        <p className="mt-1 text-base font-semibold text-slate-900 truncate">
          {servicesProductsLabel}
        </p>
      </div>

      {/* Thin Line */}
      <div className="my-4 border-t border-slate-100" />

      {/* Bottom: Price (Left) + Quick Action Icons (Right) */}
      <div className="flex items-center justify-between">
        <span className="text-lg font-bold text-slate-900 tabular-nums">
          {booking.currency} {Number(booking.total_amount || 0).toFixed(2)}
          {paid && (
            <span className="ml-1.5 inline-block w-2 h-2 rounded-full bg-emerald-500 align-middle" />
          )}
        </span>
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={handleMessage}
            disabled={isMessaging}
            className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors disabled:opacity-70 disabled:cursor-wait"
            aria-label="Message"
          >
            {isMessaging ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                  aria-label="More options"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 rounded-xl">
                {quickActions.map((action) => (
                    <DropdownMenuItem
                      key={action.label}
                      onClick={(e) => {
                        e.preventDefault();
                        action.onClick();
                      }}
                      className="cursor-pointer rounded-lg"
                    >
                      {action.label}
                    </DropdownMenuItem>
                ))}
                <DropdownMenuItem
                  onClick={(e) => {
                    e.preventDefault();
                    onClick();
                  }}
                  className="cursor-pointer rounded-lg"
                >
                  View details
                </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {isLoading && (
        <div className="absolute inset-0 rounded-[1.5rem] bg-white/80 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      )}
    </div>
  );
}
