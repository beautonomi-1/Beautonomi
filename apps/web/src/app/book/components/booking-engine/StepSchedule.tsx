"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Calendar, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { coerceSelectedDate } from "@beautonomi/utils";
import { formatLocalDateYYYYMMDD } from "@/lib/dates/format-local-date-yyyymmdd";
import { cn } from "@/lib/utils";
import { useTenantLocaleTag } from "@/hooks/useTenantLocaleTag";
import { useTranslation } from "@beautonomi/i18n";
import type { BookingData } from "../../types/booking-engine";
import { isCompleteE164 } from "@/lib/phone";
import { PhoneInput } from "@/components/ui/phone-input";
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
  BOOKING_TEXT_PRIMARY,
  BOOKING_TEXT_SECONDARY,
  MIN_TAP,
  BOOKING_ACTIVE_SCALE,
} from "../../constants";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function getSlotHour(start: string, timeZone?: string | null): number {
  const d = new Date(start);
  if (timeZone) {
    try {
      const hour = new Intl.DateTimeFormat("en-GB", {
        timeZone,
        hour: "2-digit",
        hour12: false,
      }).formatToParts(d).find((p) => p.type === "hour")?.value;
      return Number(hour === "24" ? "0" : hour);
    } catch {
      // Fall through to browser-local display if the provider timezone is invalid.
    }
  }
  return d.getHours();
}

function getSlotPeriod(start: string, timeZone?: string | null): "morning" | "afternoon" | "evening" {
  const hour = getSlotHour(start, timeZone);
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

function isoToHHMM(iso: string, timeZone?: string | null): string {
  const d = new Date(iso);
  if (timeZone) {
    try {
      const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).formatToParts(d);
      const h = parts.find((p) => p.type === "hour")?.value ?? "00";
      const m = parts.find((p) => p.type === "minute")?.value ?? "00";
      return `${h === "24" ? "00" : h}:${m}`;
    } catch {
      // Fall through to browser-local display if the provider timezone is invalid.
    }
  }
  const h = d.getHours();
  const m = d.getMinutes();
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

function isUuid(s: string | undefined): boolean {
  if (!s || typeof s !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Slot must be at least minNoticeMinutes after now (lead time), and not on a past calendar day. */
function isSlotStartStillSelectable(startIso: string, day: Date, minNoticeMinutes: number): boolean {
  const slotTime = new Date(startIso);
  const now = new Date();
  const dayStart = startOfLocalDay(day).getTime();
  const todayStart = startOfLocalDay(now).getTime();
  if (dayStart < todayStart) return false;
  const safeNotice = Number.isFinite(minNoticeMinutes) && minNoticeMinutes >= 0 ? minNoticeMinutes : 60;
  const cutoff = now.getTime() + safeNotice * 60 * 1000;
  return slotTime.getTime() >= cutoff;
}

export type ScheduleSlot = { start: string; end: string; staff_id?: string; is_available?: boolean };

interface StepScheduleProps {
  data: BookingData;
  slots: ScheduleSlot[];
  loadingSlots: boolean;
  selectedDate: Date | null;
  onSelectDate: (date: Date) => void;
  onSelectSlot: (slot: ScheduleSlot | null) => void;
  onNextAvailable: () => void;
  onNext: () => void;
  maxAdvanceDays: number;
  /** From provider_online_booking_settings — same as availability API */
  minNoticeMinutes?: number;
  providerId?: string;
  serviceId?: string | null;
  providerTimeZone?: string | null;
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
  minNoticeMinutes = 60,
  providerId = "",
  serviceId = null,
  providerTimeZone = null,
  waitlistEnabled = true,
}: StepScheduleProps) {
  const locale = useTenantLocaleTag();
  const { t } = useTranslation();
  const selectedDay = coerceSelectedDate(selectedDate);
  const router = useRouter();
  const [showMonthCalendar, setShowMonthCalendar] = useState(false);
  const [monthViewDate, setMonthViewDate] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [waitlistSlot, setWaitlistSlot] = useState<ScheduleSlot | null>(null);
  const [waitlistSubmitting, setWaitlistSubmitting] = useState(false);
  const [waitlistForm, setWaitlistForm] = useState({ name: "", email: "", phone: "" });
  const [openPeriodKey, setOpenPeriodKey] = useState<"morning" | "afternoon" | "evening" | null>(null);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const safeAdvance = Math.max(1, maxAdvanceDays);
  const lastSelectableDay = new Date(today);
  lastSelectableDay.setDate(today.getDate() + safeAdvance - 1);

  const days: Date[] = [];
  const daysToShow = Math.min(safeAdvance, 21);
  for (let i = 0; i < daysToShow; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    days.push(d);
  }

  const formatDay = (d: Date) => d.getDate().toString();
  const formatDayShort = (d: Date) => WEEKDAYS[d.getDay()].slice(0, 2);
  const formatSlot = (start: string) =>
    new Date(start).toLocaleTimeString(locale, {
      hour: "2-digit",
      minute: "2-digit",
      ...(providerTimeZone ? { timeZone: providerTimeZone } : {}),
    });
  const hasSelection = data.selectedDate != null && data.selectedSlot != null;

  const relevantSlots = useMemo(() => {
    if (!selectedDay) return slots;
    return slots.filter((s) => isSlotStartStillSelectable(s.start, selectedDay, minNoticeMinutes));
  }, [slots, selectedDay, minNoticeMinutes]);

  const morningSlots = relevantSlots.filter((s) => getSlotPeriod(s.start, providerTimeZone) === "morning");
  const afternoonSlots = relevantSlots.filter((s) => getSlotPeriod(s.start, providerTimeZone) === "afternoon");
  const eveningSlots = relevantSlots.filter((s) => getSlotPeriod(s.start, providerTimeZone) === "evening");
  const periodGroups = [
    { key: "morning" as const, label: t("booking.morning"), slots: morningSlots },
    { key: "afternoon" as const, label: t("booking.afternoon"), slots: afternoonSlots },
    { key: "evening" as const, label: t("booking.evening"), slots: eveningSlots },
  ];

  useEffect(() => {
    const first: "morning" | "afternoon" | "evening" | null =
      morningSlots.length > 0
        ? "morning"
        : afternoonSlots.length > 0
          ? "afternoon"
          : eveningSlots.length > 0
            ? "evening"
            : null;
    setOpenPeriodKey((prev) => {
      if (prev === "morning" && morningSlots.length > 0) return prev;
      if (prev === "afternoon" && afternoonSlots.length > 0) return prev;
      if (prev === "evening" && eveningSlots.length > 0) return prev;
      return first;
    });
  }, [selectedDay?.toDateString(), morningSlots.length, afternoonSlots.length, eveningSlots.length]);

  useEffect(() => {
    if (!selectedDay || !data.selectedSlot) return;
    if (isSlotStartStillSelectable(data.selectedSlot.start, selectedDay, minNoticeMinutes)) return;
    onSelectSlot(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- parent passes inline updater; avoid infinite effect loops
  }, [selectedDay, data.selectedSlot?.start, minNoticeMinutes]);

  const timezoneLabel =
    typeof Intl !== "undefined"
      ? new Date().toLocaleTimeString(locale, {
          ...(providerTimeZone ? { timeZone: providerTimeZone } : {}),
          timeZoneName: "short",
        }).split(" ").pop() || "—"
      : "—";

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
    const rawPhone = waitlistForm.phone.trim();
    if (rawPhone && !isCompleteE164(rawPhone)) {
      alert("Enter a valid phone number or leave the field blank.");
      return;
    }
    setWaitlistSubmitting(true);
    try {
      const phoneE164 = rawPhone || undefined;
      const body: Record<string, any> = {
        provider_id: providerId,
        customer_name: waitlistForm.name.trim(),
        customer_email: waitlistForm.email.trim() || undefined,
        customer_phone: phoneE164,
        preferred_date: selectedDay ? formatLocalDateYYYYMMDD(selectedDay) : "",
        preferred_time_start: isoToHHMM(waitlistSlot.start, providerTimeZone),
        preferred_time_end: isoToHHMM(waitlistSlot.end, providerTimeZone),
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

  const minViewMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const maxViewMonth = new Date(lastSelectableDay.getFullYear(), lastSelectableDay.getMonth(), 1);
  const year = monthViewDate.getFullYear();
  const month = monthViewDate.getMonth();
  const canPrevMonth = startOfLocalDay(monthViewDate).getTime() > startOfLocalDay(minViewMonth).getTime();
  const canNextMonth = startOfLocalDay(monthViewDate).getTime() < startOfLocalDay(maxViewMonth).getTime();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startPad = firstDay.getDay();
  const daysInMonth = lastDay.getDate();
  const monthDays: (Date | null)[] = [];
  for (let i = 0; i < startPad; i++) monthDays.push(null);
  for (let d = 1; d <= daysInMonth; d++) monthDays.push(new Date(year, month, d));

  const availableLabelColor = "#16a34a";

  // Period icons as inline SVG strings for zero dependency  
  const PeriodIcon = ({ period }: { period: "morning" | "afternoon" | "evening" }) => {
    if (period === "morning") return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
      </svg>
    );
    if (period === "afternoon") return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
      </svg>
    );
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
      </svg>
    );
  };

  const periodMeta: Record<"morning" | "afternoon" | "evening", { label: string; gradient: string; iconColor: string }> = {
    morning: { label: t("booking.morning"), gradient: "linear-gradient(135deg,#fffbeb 0%,#fef3c7 100%)", iconColor: "#f59e0b" },
    afternoon: { label: t("booking.afternoon"), gradient: "linear-gradient(135deg,#fff7ed 0%,#ffedd5 100%)", iconColor: "#f97316" },
    evening: { label: t("booking.evening"), gradient: "linear-gradient(135deg,#f0f9ff 0%,#e0f2fe 100%)", iconColor: "#6366f1" },
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="text-left">
        <h2 className="text-2xl font-bold tracking-tight" style={{ color: BOOKING_TEXT_PRIMARY }}>
          Choose a date &amp; time
        </h2>
        <p className="mt-1 text-sm" style={{ color: BOOKING_TEXT_SECONDARY }}>
          All times are in your local timezone ({timezoneLabel}).
        </p>
      </div>

      {/* Next available CTA */}
      <button
        type="button"
        onClick={onNextAvailable}
        className={cn(
          "w-full rounded-2xl py-3.5 font-semibold transition-all touch-manipulation flex items-center justify-center gap-2.5 text-sm",
          MIN_TAP, BOOKING_ACTIVE_SCALE
        )}
        style={{
          color: BOOKING_ACCENT,
          border: `1.5px dashed ${BOOKING_ACCENT}`,
          backgroundColor: BOOKING_WAITLIST_BG,
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={BOOKING_ACCENT} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
        </svg>
        Next available slot
      </button>

      {/* ── DATE SECTION ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold" style={{ color: BOOKING_TEXT_PRIMARY }}>
            {selectedDay
              ? selectedDay.toLocaleDateString(locale, { weekday: "long", month: "long", day: "numeric" })
              : "Select a date"}
          </p>
          <button
            type="button"
            onClick={() => {
              const base = selectedDay ?? today;
              setMonthViewDate(new Date(base.getFullYear(), base.getMonth(), 1));
              setShowMonthCalendar(true);
            }}
            className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all touch-manipulation"
            style={{ color: BOOKING_ACCENT, background: BOOKING_WAITLIST_BG, border: `1px solid ${BOOKING_ACCENT}40` }}
          >
            <Calendar className="h-3.5 w-3.5" />
            Month view
          </button>
        </div>

        {/* Scrollable day strip */}
        <div
          className="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {days.map((d) => {
            const isSelected = selectedDay?.toDateString() === d.toDateString();
            const isToday = d.toDateString() === today.toDateString();
            return (
              <button
                key={d.toISOString()}
                type="button"
                onClick={() => onSelectDate(d)}
                className={cn(
                  "shrink-0 snap-center rounded-2xl w-[68px] h-[84px] transition-all touch-manipulation flex flex-col items-center justify-center gap-0.5 relative",
                  BOOKING_ACTIVE_SCALE
                )}
                style={
                  isSelected
                    ? {
                        background: BOOKING_ACCENT,
                        color: "#fff",
                        boxShadow: `0 8px 20px ${BOOKING_ACCENT}50`,
                        border: "none",
                      }
                    : {
                        background: isToday ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.85)",
                        border: isToday ? `1.5px solid ${BOOKING_ACCENT}50` : `1px solid ${BOOKING_EDGE}`,
                        color: BOOKING_TEXT_PRIMARY,
                      }
                }
                aria-pressed={isSelected}
                aria-label={d.toLocaleDateString(locale, { weekday: "long", month: "long", day: "numeric" })}
              >
                {isToday && !isSelected && (
                  <span className="absolute top-2 left-0 right-0 text-center" style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: BOOKING_ACCENT }}>
                    TODAY
                  </span>
                )}
                <span className="text-[11px] font-semibold uppercase tracking-wide mt-2" style={{ opacity: isSelected ? 0.85 : 0.65 }}>
                  {formatDayShort(d)}
                </span>
                <span className="text-[22px] font-bold leading-tight">{formatDay(d)}</span>
                <span className="text-[10px] font-medium" style={{ opacity: 0.6 }}>
                  {MONTHS[d.getMonth()]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── MONTH CALENDAR MODAL ── */}
      {showMonthCalendar && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)" }}
          onClick={() => setShowMonthCalendar(false)}
        >
          <div
            className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl"
            style={cardStyle}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Month nav */}
            <div className="flex items-center justify-between mb-5">
              <button
                type="button"
                onClick={() => setMonthViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                disabled={!canPrevMonth}
                className="w-10 h-10 rounded-full flex items-center justify-center transition-all touch-manipulation disabled:opacity-25"
                style={{ background: "rgba(0,0,0,0.06)", color: BOOKING_TEXT_PRIMARY }}
                aria-label="Previous month"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <span className="text-base font-bold" style={{ color: BOOKING_TEXT_PRIMARY }}>
                {MONTHS[month]} {year}
              </span>
              <button
                type="button"
                onClick={() => setMonthViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                disabled={!canNextMonth}
                className="w-10 h-10 rounded-full flex items-center justify-center transition-all touch-manipulation disabled:opacity-25"
                style={{ background: "rgba(0,0,0,0.06)", color: BOOKING_TEXT_PRIMARY }}
                aria-label="Next month"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>

            {/* Day name headers */}
            <div className="grid grid-cols-7 mb-1">
              {["S","M","T","W","T","F","S"].map((w, i) => (
                <div key={i} className="text-center py-2 text-xs font-bold" style={{ color: BOOKING_TEXT_SECONDARY }}>
                  {w}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-y-1">
              {monthDays.map((d, i) => {
                if (!d) return <div key={i} />;
                const dayStart = startOfLocalDay(d);
                const beforeToday = dayStart.getTime() < today.getTime();
                const afterLast = dayStart.getTime() > startOfLocalDay(lastSelectableDay).getTime();
                const outOfRange = beforeToday || afterLast;
                const isSelected = selectedDay?.toDateString() === d.toDateString();
                const isTodayCell = d.toDateString() === today.toDateString();
                return (
                  <div key={i} className="flex items-center justify-center">
                    <button
                      type="button"
                      disabled={outOfRange}
                      onClick={() => { onSelectDate(d); setShowMonthCalendar(false); }}
                      className="relative w-10 h-10 rounded-full text-sm font-semibold transition-all touch-manipulation disabled:opacity-30 disabled:pointer-events-none"
                      style={{
                        backgroundColor: isSelected ? BOOKING_ACCENT : isTodayCell ? "rgba(0,0,0,0.07)" : "transparent",
                        color: isSelected ? "#fff" : outOfRange ? BOOKING_TEXT_SECONDARY : BOOKING_TEXT_PRIMARY,
                        boxShadow: isSelected ? `0 4px 12px ${BOOKING_ACCENT}60` : "none",
                      }}
                      aria-label={d.toLocaleDateString(locale, { weekday: "long", month: "long", day: "numeric" })}
                      aria-pressed={isSelected}
                    >
                      {d.getDate()}
                      {isTodayCell && !isSelected && (
                        <span
                          className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                          style={{ backgroundColor: BOOKING_ACCENT }}
                        />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setShowMonthCalendar(false)}
              className="mt-4 w-full rounded-2xl h-11 text-sm font-semibold transition-all touch-manipulation"
              style={{ background: "rgba(0,0,0,0.06)", color: BOOKING_TEXT_PRIMARY }}
            >
              Done
            </button>
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
            <PhoneInput
              inputId="booking-engine-waitlist-phone"
              label="Phone (optional)"
              value={waitlistForm.phone}
              onChange={(e164) => setWaitlistForm((f) => ({ ...f, phone: e164 }))}
              placeholder="Phone number"
              className="[&_label]:text-xs [&_label]:font-medium"
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

      {/* ── TIME SECTION ── */}
      {selectedDay && (
        <div className="rounded-3xl overflow-hidden" style={cardStyle}>
          <div className="px-5 pt-5 pb-3">
            <p className="text-sm font-bold" style={{ color: BOOKING_TEXT_PRIMARY }}>
              Available times
            </p>
          </div>

          {loadingSlots ? (
            <div className="px-5 pb-5 space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="rounded-2xl overflow-hidden" style={{ background: "rgba(0,0,0,0.04)" }}>
                  <div className="px-4 py-3.5 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full animate-pulse" style={{ background: "rgba(0,0,0,0.08)" }} />
                    <div className="h-4 w-24 rounded animate-pulse" style={{ background: "rgba(0,0,0,0.08)" }} />
                  </div>
                  <div className="px-4 pb-4 flex flex-wrap gap-2">
                    {[1, 2, 3, 4, 5].map((j) => (
                      <div key={j} className="h-10 w-20 rounded-xl animate-pulse" style={{ background: "rgba(0,0,0,0.06)" }} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : slots.length === 0 ? (
            <div className="px-5 pb-6 text-center">
              <div className="w-14 h-14 rounded-full mx-auto mb-3 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.04)" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={BOOKING_TEXT_SECONDARY} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
                </svg>
              </div>
              <p className="text-sm font-medium mb-1" style={{ color: BOOKING_TEXT_PRIMARY }}>No openings today</p>
              <p className="text-xs" style={{ color: BOOKING_TEXT_SECONDARY }}>Try a different date or use &quot;Next available&quot; above.</p>
            </div>
          ) : (
            <div className="px-3 pb-4 space-y-2">
              {periodGroups.map((group) =>
                group.slots.length > 0 ? (
                  <Collapsible
                    key={group.key}
                    open={openPeriodKey === group.key}
                    onOpenChange={(open) => setOpenPeriodKey(open ? group.key : null)}
                  >
                    <CollapsibleTrigger
                      className={cn(
                        "flex w-full items-center gap-3 px-3 py-3 rounded-2xl transition-all touch-manipulation",
                        MIN_TAP, BOOKING_ACTIVE_SCALE
                      )}
                      style={{
                        background: openPeriodKey === group.key ? periodMeta[group.key].gradient : "rgba(0,0,0,0.03)",
                      }}
                    >
                      <span
                        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                        style={{ background: `${periodMeta[group.key].iconColor}20`, color: periodMeta[group.key].iconColor }}
                      >
                        <PeriodIcon period={group.key} />
                      </span>
                      <span className="flex-1 text-left font-semibold text-sm" style={{ color: BOOKING_TEXT_PRIMARY }}>
                        {group.label}
                      </span>
                      <span
                        className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{
                          background: `${periodMeta[group.key].iconColor}18`,
                          color: periodMeta[group.key].iconColor,
                        }}
                      >
                        {group.slots.filter((s) => s.is_available !== false).length}
                      </span>
                      <ChevronDown
                        className={cn("h-4 w-4 shrink-0 transition-transform duration-200", openPeriodKey === group.key ? "rotate-180" : "")}
                        style={{ color: BOOKING_TEXT_SECONDARY }}
                        aria-hidden
                      />
                    </CollapsibleTrigger>

                    <CollapsibleContent>
                      <div className="px-2 pt-2 pb-1 flex flex-wrap gap-2">
                        {group.slots.map((slot, i) => {
                          const isAvailable = slot.is_available !== false;
                          const isSelected = isAvailable && data.selectedSlot?.start === slot.start;
                          return isAvailable ? (
                            <button
                              key={i}
                              type="button"
                              onClick={() => onSelectSlot(slot)}
                              className={cn("rounded-xl transition-all touch-manipulation flex flex-col items-center py-2.5 px-4 min-w-[76px]", MIN_TAP, BOOKING_ACTIVE_SCALE)}
                              style={{
                                backgroundColor: isSelected ? BOOKING_ACCENT : "rgba(255,255,255,0.95)",
                                color: isSelected ? "#fff" : BOOKING_TEXT_PRIMARY,
                                border: isSelected ? "none" : `1px solid ${BOOKING_BORDER}`,
                                boxShadow: isSelected ? `0 4px 12px ${BOOKING_ACCENT}40` : "0 1px 3px rgba(0,0,0,0.06)",
                              }}
                              aria-pressed={isSelected}
                            >
                              <span className="text-sm font-semibold">{formatSlot(slot.start)}</span>
                              <span className="text-[10px] font-bold mt-0.5" style={{ color: isSelected ? "rgba(255,255,255,0.8)" : availableLabelColor }}>
                                Open
                              </span>
                            </button>
                          ) : (
                            <button
                              key={i}
                              type="button"
                              onClick={() => waitlistEnabled && providerId && setWaitlistSlot(slot)}
                              disabled={!waitlistEnabled}
                              className={cn("rounded-xl transition-all touch-manipulation flex flex-col items-center py-2.5 px-4 min-w-[76px] opacity-60", MIN_TAP)}
                              style={{
                                backgroundColor: "rgba(0,0,0,0.04)",
                                color: BOOKING_TEXT_SECONDARY,
                                border: `1px solid ${BOOKING_BORDER}`,
                              }}
                            >
                              <span className="text-sm font-semibold">{formatSlot(slot.start)}</span>
                              {waitlistEnabled && (
                                <span className="text-[10px] font-bold mt-0.5" style={{ color: BOOKING_WAITLIST_TEXT }}>Waitlist</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                ) : null
              )}
            </div>
          )}
        </div>
      )}

      {/* Selected slot summary */}
      {hasSelection && data.selectedSlot && (
        <div
          className="rounded-2xl px-5 py-4 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300"
          style={{ background: `${BOOKING_ACCENT}10`, border: `1px solid ${BOOKING_ACCENT}30` }}
        >
          <span
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: BOOKING_ACCENT, color: "#fff" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold" style={{ color: BOOKING_TEXT_PRIMARY }}>
              {selectedDay?.toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric" })}
            </p>
            <p className="text-xs font-medium mt-0.5" style={{ color: BOOKING_ACCENT }}>
              {formatSlot(data.selectedSlot.start)}
            </p>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={onNext}
        disabled={!hasSelection}
        className={cn(
          "w-full rounded-2xl h-14 font-bold text-white transition-all touch-manipulation disabled:opacity-40 disabled:active:scale-100",
          MIN_TAP,
          BOOKING_ACTIVE_SCALE
        )}
        style={{
          backgroundColor: BOOKING_ACCENT,
          borderRadius: BOOKING_RADIUS_BUTTON,
          boxShadow: hasSelection ? `0 8px 24px ${BOOKING_ACCENT}50` : BOOKING_SHADOW_CARD,
          fontSize: "1rem",
        }}
      >
        Continue
      </button>
    </div>
  );
}
