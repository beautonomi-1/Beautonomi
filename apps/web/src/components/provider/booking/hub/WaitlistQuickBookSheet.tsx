"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { fetcher } from "@/lib/http/fetcher";
import QuickBookingModal from "@/components/provider-portal/QuickBookingModal";
import { BookingBottomSheet, BookingSectionCard, BookingActionButton } from "../ui";

type WaitlistMatch = {
  waitlist_entry_id: string;
  client_name: string;
  service_name: string;
  match_score: number;
  available_slots: Array<{ date: string; time: string; staff_id: string; staff_name: string }>;
};

interface WaitlistQuickBookSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date?: string;
  onSuccess?: () => void;
}

export function WaitlistQuickBookSheet({
  open,
  onOpenChange,
  date,
  onSuccess,
}: WaitlistQuickBookSheetProps) {
  const [matches, setMatches] = useState<WaitlistMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<WaitlistMatch | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (date) params.set("date", date);
      const res = await fetcher.get<{ matches?: WaitlistMatch[] }>(
        `/api/provider/waitlist/matches?${params}`,
      );
      setMatches(res.matches ?? []);
    } catch {
      setMatches([]);
    } finally {
      setLoading(false);
    }
  }, [open, date]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <BookingBottomSheet open={open} onOpenChange={onOpenChange} mode="view" title="Waitlist quick book">
        <div className="space-y-3 pb-4">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : matches.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">No waitlist matches for this date.</p>
          ) : (
            matches.map((m) => (
              <BookingSectionCard key={m.waitlist_entry_id}>
                <p className="font-semibold text-gray-900">{m.client_name}</p>
                <p className="text-sm text-gray-600">{m.service_name}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {m.available_slots.length} slot{m.available_slots.length === 1 ? "" : "s"} · score {m.match_score}
                </p>
                <BookingActionButton
                  className="mt-3"
                  size="sm"
                  disabled={m.available_slots.length === 0}
                  onClick={() => {
                    setSelected(m);
                    setModalOpen(true);
                  }}
                >
                  Quick book
                </BookingActionButton>
              </BookingSectionCard>
            ))
          )}
        </div>
      </BookingBottomSheet>

      {selected ? (
        <QuickBookingModal
          isOpen={modalOpen}
          onClose={() => {
            setModalOpen(false);
            setSelected(null);
          }}
          waitlistEntryId={selected.waitlist_entry_id}
          clientName={selected.client_name}
          serviceName={selected.service_name}
          availableSlots={selected.available_slots}
          onSuccess={() => {
            setModalOpen(false);
            setSelected(null);
            onOpenChange(false);
            onSuccess?.();
          }}
        />
      ) : null}
    </>
  );
}
