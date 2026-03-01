"use client";

import { Plus, Trash2, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils";
import type {
  BookingData,
  GroupParticipant,
  ServiceOption,
  BookingServiceEntry,
} from "../../types/booking-engine";
import {
  BOOKING_ACCENT,
  BOOKING_WAITLIST_BG,
  BOOKING_BORDER,
  BOOKING_EDGE,
  BOOKING_SHADOW_CARD,
  BOOKING_RADIUS_CARD,
  BOOKING_RADIUS_BUTTON,
  BOOKING_TEXT_PRIMARY,
  BOOKING_TEXT_SECONDARY,
  MIN_TAP,
  BOOKING_ACTIVE_SCALE,
} from "../../constants";

const cardStyle = {
  background: "rgba(255,255,255,0.85)",
  backdropFilter: "blur(16px) saturate(180%)",
  WebkitBackdropFilter: "blur(16px) saturate(180%)",
  border: `1px solid ${BOOKING_EDGE}`,
  borderRadius: BOOKING_RADIUS_CARD,
  boxShadow: BOOKING_SHADOW_CARD,
};

interface StepGroupParticipantsProps {
  data: BookingData;
  offerings: ServiceOption[];
  maxGroupSize: number;
  onToggleGroup: (isGroup: boolean) => void;
  onUpdateParticipants: (participants: GroupParticipant[]) => void;
  onNext: () => void;
}

export function StepGroupParticipants({
  data,
  offerings,
  maxGroupSize,
  onToggleGroup,
  onUpdateParticipants,
  onNext,
}: StepGroupParticipantsProps) {
  const isGroup = data.isGroupBooking === true;
  const participants = data.groupParticipants ?? [];
  const primaryServices = data.selectedServices;

  const addParticipant = () => {
    if (participants.length >= maxGroupSize - 1) return;
    onUpdateParticipants([
      ...participants,
      {
        id: `p-${Date.now()}`,
        name: "",
        email: "",
        phone: "",
        service_ids: [],
      },
    ]);
  };

  const updateParticipant = (index: number, updates: Partial<GroupParticipant>) => {
    const next = [...participants];
    next[index] = { ...next[index], ...updates };
    onUpdateParticipants(next);
  };

  const removeParticipant = (index: number) => {
    onUpdateParticipants(participants.filter((_, i) => i !== index));
  };

  const toggleServiceForParticipant = (participantIndex: number, offeringId: string) => {
    const p = participants[participantIndex];
    const nextIds = p.service_ids.includes(offeringId)
      ? p.service_ids.filter((id) => id !== offeringId)
      : [...p.service_ids, offeringId];
    updateParticipant(participantIndex, { service_ids: nextIds });
  };

  const canNext = () => {
    if (!isGroup) return true;
    if (participants.length === 0) return false;
    const primaryHasServices = primaryServices.length > 0;
    const allOthersHaveServices = participants.every((p) => p.service_ids.length > 0);
    const allOthersHaveNames = participants.every((p) => p.name.trim().length > 0);
    return primaryHasServices && allOthersHaveServices && allOthersHaveNames;
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="text-left">
        <h2 className="text-2xl font-semibold tracking-tight" style={{ color: BOOKING_TEXT_PRIMARY }}>
          Booking for yourself or a group?
        </h2>
        <p className="mt-1.5 text-sm" style={{ color: BOOKING_TEXT_SECONDARY }}>
          Add other guests and choose their services. You’ll be the primary contact for the booking.
        </p>
      </div>

      <div className="space-y-3">
        <button
          type="button"
          onClick={() => onToggleGroup(false)}
          className={cn(
            "w-full text-left rounded-2xl border-2 px-5 py-4 transition-all touch-manipulation flex items-center gap-4",
            MIN_TAP,
            BOOKING_ACTIVE_SCALE
          )}
          style={{
            ...cardStyle,
            borderColor: !isGroup ? BOOKING_ACCENT : BOOKING_BORDER,
            backgroundColor: !isGroup ? BOOKING_WAITLIST_BG : "rgba(0,0,0,0.02)",
          }}
        >
          <User className="h-5 w-5 shrink-0" style={{ color: !isGroup ? BOOKING_ACCENT : BOOKING_TEXT_SECONDARY }} />
          <div>
            <p className="font-semibold" style={{ color: BOOKING_TEXT_PRIMARY }}>
              Just me
            </p>
            <p className="text-sm mt-0.5" style={{ color: BOOKING_TEXT_SECONDARY }}>
              One appointment for you
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onToggleGroup(true)}
          className={cn(
            "w-full text-left rounded-2xl border-2 px-5 py-4 transition-all touch-manipulation flex items-center gap-4",
            MIN_TAP,
            BOOKING_ACTIVE_SCALE
          )}
          style={{
            ...cardStyle,
            borderColor: isGroup ? BOOKING_ACCENT : BOOKING_BORDER,
            backgroundColor: isGroup ? BOOKING_WAITLIST_BG : "rgba(0,0,0,0.02)",
          }}
        >
          <div className="flex items-center justify-center w-10 h-10 rounded-full shrink-0" style={{ backgroundColor: isGroup ? BOOKING_ACCENT : "rgba(0,0,0,0.06)" }}>
            <span className="text-sm font-bold" style={{ color: isGroup ? "#fff" : BOOKING_TEXT_PRIMARY }}>2+</span>
          </div>
          <div>
            <p className="font-semibold" style={{ color: BOOKING_TEXT_PRIMARY }}>
              Group booking
            </p>
            <p className="text-sm mt-0.5" style={{ color: BOOKING_TEXT_SECONDARY }}>
              Same time slot, each person picks their own services (up to {maxGroupSize} people)
            </p>
          </div>
        </button>
      </div>

      {isGroup && (
        <div className="space-y-6">
          {/* Primary (you) */}
          <div className="rounded-2xl p-4 border" style={{ ...cardStyle, borderColor: BOOKING_BORDER }}>
            <p className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: BOOKING_TEXT_SECONDARY }}>
              You (primary contact)
            </p>
            <p className="text-sm" style={{ color: BOOKING_TEXT_PRIMARY }}>
              {primaryServices.length > 0
                ? primaryServices.map((s) => s.title).join(", ")
                : "No services selected — go back to add services."}
            </p>
            {primaryServices.length > 0 && (
              <p className="text-xs mt-1" style={{ color: BOOKING_TEXT_SECONDARY }}>
                {primaryServices.reduce((a, s) => a + s.duration_minutes, 0)} min ·{" "}
                {formatCurrency(primaryServices.reduce((a, s) => a + s.price, 0), data.currency)}
              </p>
            )}
          </div>

          {/* Additional participants */}
          {participants.map((p, index) => (
            <div
              key={p.id}
              className="rounded-2xl p-4 border space-y-3"
              style={{ ...cardStyle, borderColor: BOOKING_BORDER }}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium" style={{ color: BOOKING_TEXT_PRIMARY }}>
                  Guest {index + 2}
                </span>
                <button
                  type="button"
                  onClick={() => removeParticipant(index)}
                  className="p-2 rounded-lg touch-manipulation"
                  style={{ color: BOOKING_TEXT_SECONDARY }}
                  aria-label="Remove guest"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Full name *"
                  value={p.name}
                  onChange={(e) => updateParticipant(index, { name: e.target.value })}
                  className="rounded-xl border-2 px-3 py-2.5 text-sm w-full"
                  style={{ borderColor: BOOKING_BORDER }}
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={p.email ?? ""}
                  onChange={(e) => updateParticipant(index, { email: e.target.value || undefined })}
                  className="rounded-xl border-2 px-3 py-2.5 text-sm w-full"
                  style={{ borderColor: BOOKING_BORDER }}
                />
                <input
                  type="tel"
                  placeholder="Phone"
                  value={p.phone ?? ""}
                  onChange={(e) => updateParticipant(index, { phone: e.target.value || undefined })}
                  className="rounded-xl border-2 px-3 py-2.5 text-sm w-full col-span-2"
                  style={{ borderColor: BOOKING_BORDER }}
                />
              </div>
              <div>
                <p className="text-xs font-medium mb-2" style={{ color: BOOKING_TEXT_SECONDARY }}>
                  Their services
                </p>
                <div className="flex flex-wrap gap-2">
                  {offerings.map((off) => {
                    const selected = p.service_ids.includes(off.id);
                    return (
                      <button
                        key={off.id}
                        type="button"
                        onClick={() => toggleServiceForParticipant(index, off.id)}
                        className={cn(
                          "rounded-xl px-3 py-2 text-sm font-medium transition-all touch-manipulation min-h-[44px]",
                          BOOKING_ACTIVE_SCALE
                        )}
                        style={{
                          backgroundColor: selected ? BOOKING_ACCENT : "rgba(0,0,0,0.06)",
                          color: selected ? "#fff" : BOOKING_TEXT_PRIMARY,
                        }}
                      >
                        {off.title} · {formatCurrency(off.price, off.currency)}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}

          {participants.length < maxGroupSize - 1 && (
            <button
              type="button"
              onClick={addParticipant}
              className={cn(
                "w-full rounded-2xl border-2 border-dashed px-5 py-4 flex items-center justify-center gap-2 touch-manipulation",
                BOOKING_ACTIVE_SCALE
              )}
              style={{ borderColor: BOOKING_BORDER, color: BOOKING_TEXT_SECONDARY }}
            >
              <Plus className="h-5 w-5" />
              <span className="font-medium">Add another guest</span>
            </button>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={onNext}
        disabled={isGroup && !canNext()}
        className={cn(
          "w-full rounded-2xl h-12 font-semibold text-white touch-manipulation transition-all duration-300 disabled:opacity-50 disabled:active:scale-100",
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
