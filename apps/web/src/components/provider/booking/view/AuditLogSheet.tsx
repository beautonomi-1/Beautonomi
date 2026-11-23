"use client";

import { useTranslation } from "@beautonomi/i18n";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { format } from "date-fns";
import { BookingBottomSheet, BookingSectionCard, BookingSectionLabel } from "../ui";

function formatAuditEvent(eventType: string | undefined, data: Record<string, unknown>): string {
  const amount = data.amount != null && data.amount !== "" ? String(data.amount) : "";
  if (eventType === "payment_received") {
    const method = String(data.payment_method ?? "payment").replace(/_/g, " ");
    return [method, amount].filter(Boolean).join(" · ");
  }
  if (eventType === "refund_issued" || eventType === "refund") {
    const method = String(data.refund_method ?? data.method ?? "refund").replace(/_/g, " ");
    return [method, amount].filter(Boolean).join(" · ");
  }
  const keys = ["status", "previous_status", "payment_method", "refund_method", "reason", "amount"];
  const lines = keys
    .filter((key) => data[key] != null && data[key] !== "")
    .map((key) => `${key.replace(/_/g, " ")}: ${String(data[key])}`);
  return lines.length > 0 ? lines.join("\n") : JSON.stringify(data);
}

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
  const { t } = useTranslation();
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
    <BookingBottomSheet open={open} onOpenChange={onOpenChange} mode="view" title={t("web.provider.bookings.detail.audit.title")}>
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      ) : entries.length === 0 ? (
        <p className="text-sm text-gray-500 py-4">{t("web.provider.bookings.detail.audit.empty")}</p>
      ) : (
        <div className="space-y-3 pb-4">
          {entries.map((entry) => (
            <BookingSectionCard key={entry.id} padding="sm">
              <BookingSectionLabel className="mb-1">{entry.event_type?.replace(/_/g, " ") ?? t("web.provider.bookings.detail.audit.updateFallback")}</BookingSectionLabel>
              <p className="text-xs text-gray-500">
                {entry.created_at
                  ? format(new Date(entry.created_at), "MMM d, yyyy · h:mm a")
                  : "—"}
                {entry.created_by_name ? ` · ${entry.created_by_name}` : ""}
              </p>
              {entry.event_data && Object.keys(entry.event_data).length > 0 ? (
                <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">
                  {formatAuditEvent(entry.event_type, entry.event_data)}
                </p>
              ) : null}
            </BookingSectionCard>
          ))}
        </div>
      )}
    </BookingBottomSheet>
  );
}
