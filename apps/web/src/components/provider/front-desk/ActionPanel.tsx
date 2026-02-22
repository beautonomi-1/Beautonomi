"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageCircle, Phone, Copy, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { FrontDeskBooking } from "@/lib/front-desk/types";
import { WorkflowStepper } from "./WorkflowStepper";
import { PaymentActions } from "./PaymentActions";
import {
  checkInBooking,
  arriveAtHome,
  startService,
  markReadyToPay,
  completeBooking,
  cancelBooking,
} from "@/lib/front-desk/actions";

const BADGE_PILLS: Record<string, string> = {
  late: "bg-red-50/90 text-red-900/90",
  arriving: "bg-blue-50/90 text-blue-900/80",
  checked_in: "bg-emerald-50/90 text-emerald-900/85",
  in_service: "bg-slate-100/90 text-slate-800",
  ready_to_pay: "bg-amber-50/90 text-amber-900/90",
  completed: "bg-emerald-50/90 text-emerald-800",
  cancelled: "bg-red-50/90 text-red-800",
  confirmed: "bg-slate-100/80 text-slate-700",
};

export interface CompleteRequestRatingPayload {
  bookingId: string;
  customerName: string;
  locationId?: string | null;
  locationName?: string | null;
}

interface ActionPanelProps {
  booking: FrontDeskBooking;
  onClose: () => void;
  onActionComplete: () => void;
  /** Call when booking is completed so parent can show required customer rating dialog */
  onCompleteRequestRating?: (payload: CompleteRequestRatingPayload) => void;
}

export function ActionPanel({ booking, onClose, onActionComplete, onCompleteRequestRating }: ActionPanelProps) {
  const customer = (booking as any).customers || {};
  const phone = customer.phone || customer.phone_number || "";
  const badge = booking.operationalBadge || "confirmed";
  const locationType = (booking as any).location_type as string | undefined;
  const isAtHome = locationType === "at_home";

  const handleCopyPhone = () => {
    if (phone) {
      navigator.clipboard.writeText(phone);
      toast.success("Phone copied");
    }
  };

  const handleMessage = () => {
    window.location.assign("/provider/messaging");
  };

  const runAction = async (fn: () => Promise<boolean>, opts?: { afterComplete?: () => void }) => {
    const ok = await fn();
    if (ok) {
      onActionComplete();
      opts?.afterComplete?.();
    }
  };

  const isReadyToPay = badge === "ready_to_pay";

  const getNextStep = (): { label: string; onClick: () => void } | null => {
    if (["completed", "cancelled"].includes(badge)) return null;
    if (badge === "ready_to_pay") return null;

    if (badge === "confirmed") {
      if (isAtHome) {
        return { label: "I've Arrived", onClick: () => runAction(() => arriveAtHome(booking.id)) };
      }
      return { label: "Check in", onClick: () => runAction(() => checkInBooking(booking.id, (booking as any).version)) };
    }
    if (["checked_in", "arriving", "late"].includes(badge)) {
      return { label: "Start service", onClick: () => runAction(() => startService(booking.id)) };
    }
    if (badge === "in_service") {
      return { label: "Ready to pay", onClick: () => runAction(() => markReadyToPay(booking.id)) };
    }
    return null;
  };

  const nextStep = getNextStep();

  return (
    <div className="flex flex-col h-full bg-[#FDFDFD]">
      {/* Header - Guest Folio */}
      <div className="p-8 pb-6 border-b border-[#0F172A]/[0.06] flex items-center justify-between shrink-0">
        <h3 className="font-semibold text-xl text-[#0F172A] truncate">
          {booking.customer_name || "Guest"}
        </h3>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="shrink-0 rounded-2xl text-[#0F172A]/60 hover:bg-[#0F172A]/[0.06] hover:text-[#0F172A]"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-8 space-y-8">
          {/* Status + Meta */}
          <div className="flex flex-wrap gap-3 items-center">
            {phone && (
              <span className="flex items-center gap-1.5 text-sm text-[#0F172A]/70">
                <Phone className="h-4 w-4" />
                {phone}
              </span>
            )}
            <span className="text-sm text-[#0F172A]/60">#{booking.booking_number}</span>
            <span
              className={cn(
                "px-2.5 py-1 rounded-full font-black text-[9px] uppercase tracking-widest",
                BADGE_PILLS[badge] || BADGE_PILLS.confirmed
              )}
            >
              {badge.replace("_", " ")}
            </span>
          </div>

          <WorkflowStepper currentBadge={badge} />

          {/* Guest Folio - Receipt-style transaction summary */}
          <div className="rounded-[2.5rem] border border-[#0F172A]/[0.08] bg-white/80 p-6 space-y-4 shadow-sm">
            <p className="text-[9px] font-black tracking-widest uppercase text-[#0F172A]/50">
              Guest Folio
            </p>
            <div className="space-y-3">
              {(booking.services || []).map((s: any, i: number) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-[#0F172A]/80">
                    {s.offering_name || s.service_name || "Service"}
                    {s.staff_name && ` · ${s.staff_name}`}
                    {s.duration_minutes && ` · ${s.duration_minutes} min`}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-sm text-[#0F172A]/60">
              {new Date(booking.scheduled_at).toLocaleString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
            {booking.location_name && (
              <p className="text-sm text-[#0F172A]/55">{booking.location_name}</p>
            )}
            <div className="pt-4 border-t border-[#0F172A]/[0.08]">
              <div className="flex justify-between items-baseline">
                <span className="text-sm text-[#0F172A]/60">Total</span>
                <span className="text-lg font-semibold text-[#0F172A]">
                  {booking.currency} {Number(booking.total_amount || 0).toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Quick actions */}
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-[#0F172A]/50 mb-3">
              Quick actions
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-2 rounded-2xl border-[#0F172A]/12 hover:bg-[#0F172A]/[0.04]"
                onClick={handleMessage}
              >
                <MessageCircle className="h-4 w-4" />
                Message
              </Button>
              {phone && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 rounded-2xl border-[#0F172A]/12 hover:bg-[#0F172A]/[0.04]"
                  onClick={handleCopyPhone}
                >
                  <Copy className="h-4 w-4" />
                  Copy phone
                </Button>
              )}
            </div>
          </div>

          {/* Payment Footer or Next Step */}
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-[#0F172A]/50 mb-4">
              {isReadyToPay ? "Payment" : "Workflow"}
            </p>

            {isReadyToPay ? (
              <div className="space-y-4">
                <PaymentActions
                  bookingId={booking.id}
                  totalAmount={Number(booking.total_amount || 0)}
                  totalPaid={Number((booking as any).total_paid || 0)}
                  currency={booking.currency || "ZAR"}
                  onComplete={onActionComplete}
                  variant="footer"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full rounded-2xl border-[#0F172A]/12 hover:bg-[#0F172A]/[0.04] text-[#0F172A]"
                  onClick={() =>
                    runAction(() => completeBooking(booking.id, (booking as any).version), {
                      afterComplete: () =>
                        onCompleteRequestRating?.({
                          bookingId: booking.id,
                          customerName: booking.customer_name || "Customer",
                          locationId: (booking as any).location_id ?? null,
                          locationName: (booking as any).location_name ?? null,
                        }),
                    })
                  }
                >
                  Mark completed (cash / offline)
                </Button>
              </div>
            ) : nextStep ? (
              <Button
                size="lg"
                className="w-full h-14 rounded-[2.5rem] bg-[#0F172A] hover:bg-[#0F172A]/90 text-white font-semibold text-base shadow-lg transition-all duration-300"
                onClick={nextStep.onClick}
              >
                {nextStep.label}
              </Button>
            ) : null}
          </div>

          {/* Cancel */}
          {!["completed", "cancelled"].includes(badge) && (
            <Button
              variant="outline"
              size="sm"
              className="w-full rounded-2xl border-red-200 text-red-800 hover:bg-red-50 font-medium"
              onClick={() => runAction(() => cancelBooking(booking.id, undefined, (booking as any).version))}
            >
              Cancel booking
            </Button>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
