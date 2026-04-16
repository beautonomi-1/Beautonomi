"use client";

import React, { memo } from "react";
import { cn } from "@/lib/utils";
import { mapStatus } from "@/lib/scheduling/mangomintAdapter";
import { getStatusColors } from "@/lib/scheduling/visualMapping";
import { DraggableAppointment } from "@/components/provider-portal/DragDropCalendar";
import type { Appointment } from "@/lib/provider-portal/types";
import {
  getAppointmentColors,
  formatTime12h,
  getEndTime,
  isNewBooking,
  parseScheduledTime,
  type AppointmentColor,
} from "./utils";
import { HOUR_HEIGHT } from "./constants";

interface BookingBlockProps {
  appointment: Appointment;
  startHour: number;
  useMangomintMode: boolean;
  colorBy: "status" | "service" | "team_member";
  showCanceled: boolean;
  showPrices: boolean;
  onClick: (apt: Appointment) => void;
  /** "day" renders full detail; "week" renders compact */
  variant: "day" | "week";
  /** Locale-aware currency formatter; falls back to `R` prefix when not provided. */
  formatPrice?: (amount: number) => string;
}

function BookingBlockComponent({
  appointment: apt,
  startHour,
  useMangomintMode,
  colorBy,
  showCanceled,
  showPrices,
  onClick,
  variant,
  formatPrice,
}: BookingBlockProps) {
  const fmtPrice = formatPrice ?? ((n: number) => `R${n.toFixed(0)}`);
  const isGroupBooking = !!(apt as any).is_group_booking;
  const { hour, minute: min } = parseScheduledTime(apt.scheduled_time);
  const top = (hour - startHour) * HOUR_HEIGHT + (min / 60) * HOUR_HEIGHT;
  const minH = variant === "day" ? 36 : 24;
  const height = Math.max((apt.duration_minutes / 60) * HOUR_HEIGHT, minH);

  const colors: AppointmentColor = getAppointmentColors(apt, useMangomintMode, colorBy, showCanceled);
  if (colors.hidden) return null;

  const isCanceled = apt.status === "cancelled";
  const isNew = variant === "day" && isNewBooking(apt.created_date, apt.status);
  const endTime = variant === "day" ? getEndTime(apt.scheduled_time || "00:00", apt.duration_minutes) : null;
  const showNonBookedBadge = apt.status !== "booked" || apt.db_status === "pending";

  if (variant === "week") {
    return (
      <DraggableAppointment
        appointment={apt}
        className={cn(
          "absolute left-0.5 right-0.5 rounded px-1 py-0.5 hover:shadow-md hover:z-10 transition-all z-10",
          isCanceled && useMangomintMode && "opacity-50",
        )}
        style={{ top: `${top}px` }}
      >
        <div
          style={{
            position: "relative",
            height: `${height}px`,
            minHeight: `${minH}px`,
            backgroundColor: colors.bg,
            borderLeft: `3px solid ${colors.border}`,
            opacity: colors.opacity,
          }}
          onClick={(e) => { e.stopPropagation(); onClick(apt); }}
        >
          {showNonBookedBadge && (() => {
            const sc = getStatusColors(mapStatus(apt));
            return (
              <span className={cn("absolute top-0.5 right-0.5 text-[8px] font-semibold px-1 py-0 rounded", sc.badgeClasses)}>
                {sc.label}
              </span>
            );
          })()}
          {isGroupBooking && (
            <span className="absolute top-0.5 left-0.5 text-[7px] font-bold px-0.5 rounded bg-purple-600 text-white leading-tight">
              GRP
            </span>
          )}
          <p
            className={cn("text-[10px] font-bold truncate", isCanceled && useMangomintMode && "line-through")}
            style={{ color: colors.text }}
          >
            {apt.client_name}
          </p>
        </div>
      </DraggableAppointment>
    );
  }

  return (
    <DraggableAppointment
      appointment={apt}
      className={cn(
        "absolute left-1 right-1 rounded-md z-10",
        "transition-all duration-150 hover:shadow-lg hover:z-30 hover:scale-[1.02]",
        "overflow-hidden group",
        isCanceled && useMangomintMode && "opacity-50",
      )}
      style={{ position: "absolute", top: `${top}px` }}
    >
      <div
        style={{
          position: "relative",
          height: `${height}px`,
          minHeight: `${minH}px`,
          backgroundColor: colors.bg,
          borderLeft: `4px solid ${colors.border}`,
          opacity: colors.opacity,
        }}
        onClick={(e) => { e.stopPropagation(); onClick(apt); }}
      >
        <div className="px-2 py-1 h-full flex flex-col">
          <div className="absolute top-1 right-1 flex items-center gap-1 flex-wrap justify-end max-w-full">
            {isGroupBooking && (
              <span className="text-[8px] font-bold px-1 py-0 rounded shrink-0 bg-purple-600 text-white">
                GROUP
              </span>
            )}
            {isNew && (
              <span
                className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0"
                style={{ backgroundColor: colors.border, color: "#fff" }}
              >
                NEW
              </span>
            )}
            {showNonBookedBadge && (() => {
              const sc = getStatusColors(mapStatus(apt));
              return (
                <span className={cn("text-[9px] font-semibold px-1.5 py-0.5 rounded shrink-0", sc.badgeClasses)}>
                  {sc.label.toUpperCase()}
                </span>
              );
            })()}
          </div>

          {height >= 48 ? (
            <>
              <p className="text-[10px] font-bold uppercase tracking-wide leading-tight truncate" style={{ color: colors.text }}>
                {apt.service_name}
              </p>
              <p className="text-sm font-bold truncate leading-tight" style={{ color: colors.text }}>
                {apt.client_name}
              </p>
              <p className="text-[10px] opacity-70 mt-auto" style={{ color: colors.text }}>
                {formatTime12h(apt.scheduled_time)} - {formatTime12h(endTime!)}
                {showPrices && (apt.price != null || (apt as any).total_amount != null) && (
                  <span className="ml-1 font-semibold">
                    · {fmtPrice((apt as any).total_amount ?? apt.price ?? 0)}
                  </span>
                )}
              </p>
            </>
          ) : (
            <div className="flex items-center h-full">
              <span className="text-xs font-bold truncate" style={{ color: colors.text }}>
                {apt.client_name}
              </span>
            </div>
          )}
        </div>
      </div>
    </DraggableAppointment>
  );
}

export const BookingBlock = memo(BookingBlockComponent, (prev, next) =>
  prev.appointment.id === next.appointment.id &&
  prev.appointment.status === next.appointment.status &&
  prev.appointment.scheduled_time === next.appointment.scheduled_time &&
  prev.appointment.scheduled_date === next.appointment.scheduled_date &&
  prev.appointment.duration_minutes === next.appointment.duration_minutes &&
  prev.appointment.service_name === next.appointment.service_name &&
  prev.appointment.client_name === next.appointment.client_name &&
  prev.startHour === next.startHour &&
  prev.useMangomintMode === next.useMangomintMode &&
  prev.colorBy === next.colorBy &&
  prev.showCanceled === next.showCanceled &&
  prev.showPrices === next.showPrices &&
  prev.variant === next.variant &&
  prev.formatPrice === next.formatPrice,
);

BookingBlock.displayName = "BookingBlock";
