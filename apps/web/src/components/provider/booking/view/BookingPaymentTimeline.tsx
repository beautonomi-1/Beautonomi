"use client";

import { Loader2 } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { useProviderMoneyFormat } from "@/hooks/use-provider-money-format";
import {
  getBookingPaymentChannelLabel,
  type BookingPaymentRow,
  type BookingRefundRow,
} from "@beautonomi/provider-booking";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const TONE_CLASSES = {
  online: "bg-blue-100 text-blue-800",
  terminal: "bg-violet-100 text-violet-800",
  cash: "bg-amber-100 text-amber-900",
  wallet: "bg-emerald-100 text-emerald-800",
  gift: "bg-pink-100 text-pink-800",
  other: "bg-gray-100 text-gray-700",
} as const;

function formatWhen(iso?: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

interface BookingPaymentTimelineProps {
  bookingId: string;
}

export function BookingPaymentTimeline({ bookingId }: BookingPaymentTimelineProps) {
  const { format: formatMoney } = useProviderMoneyFormat();
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<BookingPaymentRow[]>([]);
  const [refunds, setRefunds] = useState<BookingRefundRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetcher.get<{
          data?: { payments?: BookingPaymentRow[]; refunds?: BookingRefundRow[] };
        }>(`/api/provider/bookings/${bookingId}/payments`);
        if (cancelled) return;
        setPayments(res?.data?.payments ?? []);
        setRefunds(res?.data?.refunds ?? []);
      } catch {
        if (!cancelled) {
          setPayments([]);
          setRefunds([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  if (loading) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  if (payments.length === 0 && refunds.length === 0) return null;

  return (
    <div className="space-y-2">
      {payments.map((payment, index) => {
        const channel = getBookingPaymentChannelLabel(payment);
        return (
          <div key={`pay-${index}`} className="rounded-lg bg-gray-50 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", TONE_CLASSES[channel.tone])}>
                {channel.label}
              </span>
              <span className="text-sm font-semibold text-gray-900 tabular-nums">
                +{formatMoney(Number(payment.amount ?? 0))}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-gray-500">
              {formatWhen(payment.created_at)}
              {payment.created_by_user?.full_name ? ` · ${payment.created_by_user.full_name}` : ""}
            </p>
          </div>
        );
      })}
      {refunds.map((refund, index) => {
        const method = (refund.refund_method ?? "").toLowerCase();
        const status = (refund.status ?? "").toLowerCase();
        const pendingCashConfirm = method === "cash" && status === "pending";
        return (
          <div
            key={`ref-${index}`}
            className={cn(
              "rounded-lg px-3 py-2",
              pendingCashConfirm ? "bg-amber-50" : "bg-orange-50",
            )}
          >
            <p
              className={cn(
                "text-sm font-semibold tabular-nums",
                pendingCashConfirm ? "text-amber-900" : "text-orange-900",
              )}
            >
              Refund −{formatMoney(Number(refund.amount ?? 0))}
              {method === "original"
                ? " (original method)"
                : method === "cash"
                  ? " (in person)"
                  : " (store credit)"}
            </p>
            <p
              className={cn(
                "mt-0.5 text-xs",
                pendingCashConfirm ? "text-amber-800" : "text-orange-800",
              )}
            >
              {pendingCashConfirm
                ? "Awaiting customer confirmation"
                : formatWhen(refund.created_at)}
              {!pendingCashConfirm && refund.reason ? ` · ${refund.reason}` : ""}
              {pendingCashConfirm && refund.reason ? ` · ${refund.reason}` : ""}
            </p>
          </div>
        );
      })}
    </div>
  );
}
