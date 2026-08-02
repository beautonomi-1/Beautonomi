"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { format } from "date-fns";
import { BookingBottomSheet, BookingSectionCard, BookingSectionLabel } from "../ui";

type AuditEntry = {
  id: string;
  event_type?: string;
  created_at?: string;
  created_by_name?: string;
  event_data?: Record<string, unknown> | null;
};

interface AuditLogSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string;
}

export function AuditLogSheet({ open, onOpenChange, bookingId }: AuditLogSheetProps) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetcher.get<{ data?: AuditEntry[] }>(
          `/api/provider/bookings/${bookingId}/audit-log`,
        );
        if (!cancelled) setEntries(res?.data ?? []);
      } catch {
        if (!cancelled) setEntries([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, bookingId]);

  return (
    <BookingBottomSheet open={open} onOpenChange={onOpenChange} mode="view" title="Audit log">
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      ) : entries.length === 0 ? (
        <p className="text-sm text-gray-500 py-4">No audit entries yet.</p>
      ) : (
        <div className="space-y-3 pb-4">
          {entries.map((entry) => (
            <BookingSectionCard key={entry.id} padding="sm">
              <BookingSectionLabel className="mb-1">{entry.event_type?.replace(/_/g, " ") ?? "Update"}</BookingSectionLabel>
              <p className="text-xs text-gray-500">
                {entry.created_at
                  ? format(new Date(entry.created_at), "MMM d, yyyy · h:mm a")
                  : "—"}
                {entry.created_by_name ? ` · ${entry.created_by_name}` : ""}
              </p>
              {entry.event_data && Object.keys(entry.event_data).length > 0 ? (
                <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">
                  {JSON.stringify(entry.event_data, null, 2)}
                </p>
              ) : null}
            </BookingSectionCard>
          ))}
        </div>
      )}
    </BookingBottomSheet>
  );
}
