"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Calendar, X, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BookingData } from "../../types/booking-engine";
import { normalizePhoneToE164, DEFAULT_PHONE_COUNTRY_CODE } from "@/lib/phone";
import {
  BOOKING_ACCENT,
  BOOKING_WAITLIST_BG,
  BOOKING_WAITLIST_TEXT,
  BOOKING_BORDER,
  BOOKING_EDGE,
  BOOKING_GLASS_BG,
  BOOKING_SHADOW_CARD,
  BOOKING_RADIUS_CARD,
  BOOKING_RADIUS_BUTTON,
  BOOKING_RADIUS_PILL,
  BOOKING_TEXT_PRIMARY,
  BOOKING_TEXT_SECONDARY,
  MIN_TAP,
  BOOKING_ACTIVE_SCALE,
} from "../../constants";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function getSlotPeriod(start: string): "morning" | "afternoon" | "evening" {
  const hour = new Date(start).getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

function isoToHHMM(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes();
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

function isUuid(s: string | undefined): boolean {
  if (!s || typeof s !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

export type ScheduleSlot = { start: string; end: string; staff_id?: string; is_available?: boolean };

interface StepScheduleProps {
  data: BookingData;
  slots: ScheduleSlot[];
  loadingSlots: boolean;
  selectedDate: Date | null;
  onSelectDate: (date: Date) => void;
  onSelectSlot: (slot: ScheduleSlot) => void;
  onNextAvailable: () => void;
  onNext: () => void;
  maxAdvanceDays: number;
  providerId?: string;
  serviceId?: string | null;
  /** When false, unavailable slots are shown grayed out but without "Join Waitlist" */
  waitlistEnabled?: boolean;
}

export function StepSchedule({
  data,
  slots,
  loadingSlots,
  selectedDate,
  onSelectDate,
  onSelectSlot,
  onNextAvailable,
  onNext,
  maxAdvanceDays,
  providerId = "",
  serviceId = null,
  waitlistEnabled = true,
}: StepScheduleProps) {
  const router = useRouter();
  const [showMonthCalendar, setShowMonthCalendar] = useState(false);
  const [waitlistSlot, setWaitlistSlot] = useState<ScheduleSlot | null>(null);
  const [waitlistSubmitting, setWaitlistSubmitting] = useState(false);
  const [waitlistForm, setWaitlistForm] = useState({ name: "", email: "", phone: "" });
  const [expandedPeriods, setExpandedPeriods] = useState<Set<string>>(new Set(["MORNING"]));
  const togglePeriod = (label: string) => {
    setExpandedPeriods((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days: Date[] = [];
  const daysToShow = Math.min(maxAdvanceDays, 21);
  for (let i = 0; i < daysToShow; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    days.push(d);
  }

  const formatDay = (d: Date) => d.getDate().toString();
  const formatDayShort = (d: Date) => WEEKDAYS[d.getDay()].slice(0, 2);
  const formatSlot = (start: string) =>
    new Date(start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const hasSelection = data.selectedDate != null && data.selectedSlot != null;

  const availableSlots = slots.filter((s) => s.is_available !== false);
  const morningSlots = slots.filter((s) => getSlotPeriod(s.start) === "morning");
  const afternoonSlots = slots.filter((s) => getSlotPeriod(s.start) === "afternoon");
  const eveningSlots = slots.filter((s) => getSlotPeriod(s.start) === "evening");
  const periodGroups = [
    { label: "MORNING", slots: morningSlots },
    { label: "AFTERNOON", slots: afternoonSlots },
    { label: "EVENING", slots: eveningSlots },
  ];

  const timezoneLabel =
    typeof Intl !== "undefined"
      ? new Date().toLocaleTimeString("en-ZA", { timeZoneName: "short" }).split(" ").pop() || "SAST"
      : "SAST";

  const cardStyle = {
    background: BOOKING_GLASS_BG,
    backdropFilter: "blur(16px) saturate(180%)",
    WebkitBackdropFilter: "blur(16px) saturate(180%)",
    border: `1px solid ${BOOKING_EDGE}`,
    borderRadius: BOOKING_RADIUS_CARD,
    boxShadow: BOOKING_SHADOW_CARD,
  };

  const handleJoinWaitlist = async () => {
    if (!waitlistSlot || !providerId || !waitlistForm.name.trim()) return;
    setWaitlistSubmitting(true);
    try {
      const rawPhone = waitlistForm.phone.trim();
      const phoneE164 = rawPhone
        ? normalizePhoneToE164(rawPhone, DEFAULT_PHONE_COUNTRY_CODE) || normalizePhoneToE164(rawPhone) || rawPhone
        : undefined;
      const body: Record<string, unknown> = {
        provider_id: providerId,
        customer_name: waitlistForm.name.trim(),
        customer_email: waitlistForm.email.trim() || undefined,
        customer_phone: phoneE164,
        preferred_date: selectedDate?.toISOString().split("T")[0],
        preferred_time_start: isoToHHMM(waitlistSlot.start),
        preferred_time_end: isoToHHMM(waitlistSlot.end),
      };
      if (serviceId && isUuid(serviceId)) body.service_id = serviceId;
      if (waitlistSlot.staff_id && isUuid(waitlistSlot.staff_id)) body.staff_id = waitlistSlot.staff_id;

      const res = await fetch("/api/public/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const errData = await res.json().catch(() => ({}));
      if (!res.ok) {
        const code = errData?.error?.code;
        const msg =
          res.status === 403 && (code === "FEATURE_DISABLED" || code === "NOT_FOUND")
            ? "This provider doesn't offer waitlist."
            : errData?.error?.message || "Could not join waitlist.";
        throw new Error(msg);
      }
      router.push("/checkout/success?waitlist=1");
      return;
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not join waitlist");
    } finally {
      setWaitlistSubmitting(false);
    }
  };

  const monthForCalendar = selectedDate
    ? new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)
    : new Date(today.getFullYear(), today.getMonth(), 1);
  const year = monthForCalendar.getFullYear();
  const month = monthForCalendar.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startPad = firstDay.getDay();
  const daysInMonth = lastDay.getDate();
  const monthDays: (Date | null)[] = [];
  for (let i = 0; i < startPad; i++) monthDays.push(null);
  for (let d = 1; d <= daysInMonth; d++) monthDays.push(new Date(year, month, d));

  const availableLabelColor = "#16a34a";

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="text-left">
        <h2 className="text-2xl font-semibold tracking-tight" style={{ color: BOOKING_TEXT_PRIMARY }}>
          Find an Opening
        </h2>
        <p className="mt-1.5 text-sm" style={{ color: BOOKING_TEXT_SECONDARY }}>
          All times shown in your local timezone.
        </p>
      </div>

      <button
        type="button"
        onClick={onNextAvailable}
        className={cn(
          "w-full rounded-2xl border-2 border-dashed py-3.5 font-semibold transition-all touch-manipulation flex items-center justify-center gap-2",
          MIN_TAP,
          BOOKING_ACTIVE_SCALE
        )}
        style={{
          color: BOOKING_ACCENT,
          borderColor: BOOKING_ACCENT,
          backgroundColor: BOOKING_WAITLIST_BG,
        }}
      >
        Next available
      </button>

      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium" style={{ color: BOOKING_TEXT_PRIMARY }}>
            Date
          </p>
          <button
            type="button"
            onClick={() => setShowMonthCalendar(true)}
            className="text-xs flex items-center gap-1 min-h-[44px] min-w-[44px] justify-end touch-manipulation"
            style={{ color: BOOKING_ACCENT }}
          >
            <Calendar className="h-3.5 w-3.5" />
            Full month
          </button>
        </div>
        <div
          className="flex gap-2 overflow-x-auto pb-2 snap-x snap-mandatory"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch" }}
        >
          {days.map((d) => {
            const isSelected = selectedDate?.toDateString() === d.toDateString();
            const isToday = d.toDateString() === today.toDateString();
            return (
              <button
                key={d.toISOString()}
                type="button"
                onClick={() => onSelectDate(d)}
                className={cn(
                  "shrink-0 snap-center rounded-2xl min-w-[64px] py-3 px-3 transition-all touch-manipulation flex flex-col items-center justify-center",
                  MIN_TAP,
                  BOOKING_ACTIVE_SCALE
                )}
                style={
                  isSelected
                    ? {
                        background: BOOKING_GLASS_BG,
                        backdropFilter: "blur(16px) saturate(180%)",
                        border: `2px solid ${BOOKING_ACCENT}`,
                        color: BOOKING_ACCENT,
                        boxShadow: BOOKING_SHADOW_CARD,
                      }
                    : {
                        background: isToday ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.7)",
                        border: `1px solid ${BOOKING_EDGE}`,
                        color: BOOKING_TEXT_PRIMARY,
                      }
                }
              >
                <span className="text-[10px] font-medium uppercase" style={{ opacity: 0.8 }}>
                  {formatDayShort(d)}
                </span>
                <span className="text-lg font-semibold mt-0.5">{formatDay(d)}</span>
              </button>
            );
          })}
        </div>
        <p className="text-xs mt-2" style={{ color: BOOKING_TEXT_SECONDARY }}>
          Times shown in your local timezone ({timezoneLabel})
        </p>
      </div>

      {showMonthCalendar && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
          onClick={() => setShowMonthCalendar(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl p-5 shadow-xl"
            style={cardStyle}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <span className="font-semibold" style={{ color: BOOKING_TEXT_PRIMARY }}>
                {MONTHS[month]} {year}
              </span>
              <button
                type="button"
                onClick={() => setShowMonthCalendar(false)}
                className="p-2 rounded-full touch-manipulation"
                style={{ color: BOOKING_TEXT_SECONDARY }}
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {WEEKDAYS.map((w) => (
                <div key={w} className="text-center text-xs py-1" style={{ color: BOOKING_TEXT_SECONDARY }}>
                  {w}
                </div>
              ))}
              {monthDays.map((d, i) => (
                <div key={i} className="flex items-center justify-center">
                  {d ? (
                    <button
                      type="button"
                      onClick={() => {
                        onSelectDate(d);
                        setShowMonthCalendar(false);
                      }}
                      className={cn(
                        "w-10 h-10 rounded-xl text-sm font-medium touch-manipulation",
                        selectedDate?.toDateString() === d.toDateString()
                          ? "text-white"
                          : d.toDateString() === today.toDateString()
                          ? "bg-gray-200"
                          : "hover:bg-black/5"
                      )}
                      style={{
                        backgroundColor:
                          selectedDate?.toDateString() === d.toDateString() ? BOOKING_ACCENT : undefined,
                        color:
                          selectedDate?.toDateString() === d.toDateString()
                            ? "#fff"
                            : d < today
                            ? BOOKING_TEXT_SECONDARY
                            : BOOKING_TEXT_PRIMARY,
                      }}
                    >
                      {d.getDate()}
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {waitlistSlot && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
          onClick={() => !waitlistSubmitting && setWaitlistSlot(null)}
        >
          <div
            className="w-full max-w-sm rounded-3xl p-5 shadow-xl space-y-4"
            style={cardStyle}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold" style={{ color: BOOKING_TEXT_PRIMARY }}>
              Join waitlist
            </h3>
            <p className="text-sm" style={{ color: BOOKING_TEXT_SECONDARY }}>
              We'll notify you when {formatSlot(waitlistSlot.start)} becomes available.
            </p>
            <input
              type="text"
              placeholder="Your name *"
              value={waitlistForm.name}
              onChange={(e) => setWaitlistForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full rounded-xl border px-4 py-3 text-sm min-h-[44px]"
              style={{ borderColor: BOOKING_BORDER }}
            />
            <input
              type="email"
              placeholder="Email"
              value={waitlistForm.email}
              onChange={(e) => setWaitlistForm((f) => ({ ...f, email: e.target.value }))}
              className="w-full rounded-xl border px-4 py-3 text-sm min-h-[44px]"
              style={{ borderColor: BOOKING_BORDER }}
            />
            <input
              type="tel"
              placeholder="Phone"
              value={waitlistForm.phone}
              onChange={(e) => setWaitlistForm((f) => ({ ...f, phone: e.target.value }))}
              className="w-full rounded-xl border px-4 py-3 text-sm min-h-[44px]"
              style={{ borderColor: BOOKING_BORDER }}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setWaitlistSlot(null)}
                disabled={waitlistSubmitting}
                className="flex-1 rounded-xl py-3 font-medium border min-h-[44px]"
                style={{ borderColor: BOOKING_BORDER, color: BOOKING_TEXT_PRIMARY }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleJoinWaitlist}
                disabled={waitlistSubmitting || !waitlistForm.name.trim()}
                className="flex-1 rounded-xl py-3 font-semibold text-white min-h-[44px] disabled:opacity-50"
                style={{ backgroundColor: BOOKING_ACCENT }}
              >
                {waitlistSubmitting ? "Joining..." : "Join waitlist"}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedDate && (
        <div className="p-5 rounded-3xl" style={cardStyle}>
          <p className="text-sm font-medium mb-3" style={{ color: BOOKING_TEXT_PRIMARY }}>
            Time
          </p>
          {loadingSlots ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" style={{ color: BOOKING_TEXT_SECONDARY }} />
            </div>
          ) : slots.length === 0 ? (
            <p
              className="text-sm py-4 text-center rounded-2xl"
              style={{ backgroundColor: "rgba(0,0,0,0.04)", color: BOOKING_TEXT_SECONDARY }}
            >
              No slots available this day. Try another date.
            </p>
          ) : (
            <div className="space-y-2">
              {periodGroups.map(
                (group) =>
                  group.slots.length > 0 && (
                    <div key={group.label} className="rounded-xl border overflow-hidden" style={{ borderColor: BOOKING_BORDER }}>
                      <button
                        type="button"
                        onClick={() => togglePeriod(group.label)}
                        className={cn(
                          "w-full flex items-center justify-between px-4 py-3 text-left touch-manipulation",
                          MIN_TAP,
                          BOOKING_ACTIVE_SCALE
                        )}
                        style={{ backgroundColor: "rgba(0,0,0,0.03)", color: BOOKING_TEXT_PRIMARY }}
                      >
                        <span className="text-xs font-medium uppercase tracking-wider">
                          {group.label}
                        </span>
                        {expandedPeriods.has(group.label) ? (
                          <ChevronUp className="h-4 w-4" style={{ color: BOOKING_TEXT_SECONDARY }} />
                        ) : (
                          <ChevronDown className="h-4 w-4" style={{ color: BOOKING_TEXT_SECONDARY }} />
                        )}
                      </button>
                      {expandedPeriods.has(group.label) && (
                      <div className="px-4 pb-3 pt-1 flex flex-wrap gap-2">
                        {group.slots.map((slot, i) => {
                          const isAvailable = slot.is_available !== false;
                          const isSelected =
                            isAvailable && data.selectedSlot?.start === slot.start;
                          if (isAvailable) {
                            return (
                              <button
                                key={i}
                                type="button"
                                onClick={() => onSelectSlot(slot)}
                                className={cn(
                                  "rounded-xl py-3 px-4 text-sm font-medium transition-all touch-manipulation min-w-[80px] flex flex-col items-center gap-0.5",
                                  MIN_TAP,
                                  BOOKING_ACTIVE_SCALE
                                )}
                                style={{
                                  borderRadius: BOOKING_RADIUS_PILL,
                                  backgroundColor: isSelected ? BOOKING_ACCENT : "rgba(0,0,0,0.04)",
                                  color: isSelected ? "#fff" : BOOKING_TEXT_PRIMARY,
                                  border: isSelected ? "none" : `1px solid ${BOOKING_BORDER}`,
                                }}
                              >
                                <span>{formatSlot(slot.start)}</span>
                                <span className="text-[10px] font-semibold" style={{ color: isSelected ? "#fff" : availableLabelColor }}>
                                  Available
                                </span>
                              </button>
                            );
                          }
                          return (
                            <button
                              key={i}
                              type="button"
                              onClick={() => waitlistEnabled && providerId && setWaitlistSlot(slot)}
                              disabled={!waitlistEnabled}
                              className={cn(
                                "rounded-xl py-3 px-4 text-sm font-medium transition-all touch-manipulation min-w-[80px] flex flex-col items-center gap-0.5",
                                MIN_TAP,
                                BOOKING_ACTIVE_SCALE
                              )}
                              style={{
                                borderRadius: BOOKING_RADIUS_PILL,
                                backgroundColor: "rgba(0,0,0,0.06)",
                                color: BOOKING_TEXT_SECONDARY,
                                border: `1px solid ${BOOKING_BORDER}`,
                              }}
                            >
                              <span>{formatSlot(slot.start)}</span>
                              {waitlistEnabled && (
                                <span
                                  className="text-[10px] font-semibold"
                                  style={{ color: BOOKING_WAITLIST_TEXT }}
                                >
                                  Join Waitlist
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                      )}
                    </div>
                  )
              )}
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={onNext}
        disabled={!hasSelection}
        className={cn(
          "w-full rounded-2xl h-12 font-semibold text-white transition-all touch-manipulation disabled:opacity-50 disabled:active:scale-100",
          MIN_TAP,
          BOOKING_ACTIVE_SCALE
        )}
        style={{
          backgroundColor: BOOKING_ACCENT,
          borderRadius: BOOKING_RADIUS_BUTTON,
          boxShadow: BOOKING_SHADOW_CARD,
        }}
      >
        Continue
      </button>
    </div>
  );
}
