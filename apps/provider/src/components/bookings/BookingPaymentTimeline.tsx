import { View, Text, ActivityIndicator } from "react-native";
import { useApi } from "@/hooks/useApi";
import { twStyle } from "@/lib/twStyle";
import { formatCurrency } from "@/lib/format";
import {
  getBookingPaymentChannelLabel,
  type BookingPaymentRow,
  type BookingRefundRow,
} from "@/lib/booking-payment-channel";

type Props = {
  bookingId: string;
  currency: string;
};

const TONE_STYLES = {
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

export function BookingPaymentTimeline({ bookingId, currency }: Props) {
  const { data, loading } = useApi<{
    payments?: BookingPaymentRow[];
    refunds?: BookingRefundRow[];
  }>(`/api/provider/bookings/${bookingId}/payments`);

  const payments = data?.payments ?? [];
  const refunds = data?.refunds ?? [];

  if (loading) {
    return <ActivityIndicator style={twStyle("my-2")} />;
  }

  if (payments.length === 0 && refunds.length === 0) {
    return null;
  }

  return (
    <View style={twStyle("mt-3 border-t border-gray-100 pt-3")}>
      <Text style={twStyle("mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500")}>
        Payment timeline
      </Text>
      {payments.map((payment, index) => {
        const channel = getBookingPaymentChannelLabel(payment);
        const toneClass = TONE_STYLES[channel.tone];
        return (
          <View
            key={`pay-${index}`}
            style={twStyle("mb-2 flex-row items-start justify-between rounded-lg bg-gray-50 px-3 py-2")}
          >
            <View style={twStyle("flex-1 pr-2")}>
              <View style={twStyle("flex-row flex-wrap items-center gap-1")}>
                <View style={twStyle(`rounded-full px-2 py-0.5 ${toneClass.split(" ")[0]}`)}>
                  <Text style={twStyle(`text-[10px] font-semibold uppercase ${toneClass.split(" ")[1]}`)}>
                    {channel.label}
                  </Text>
                </View>
                <Text style={twStyle("text-sm font-semibold text-gray-900")}>
                  +{formatCurrency(Number(payment.amount ?? 0), currency)}
                </Text>
              </View>
              <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>
                {formatWhen(payment.created_at)}
                {payment.created_by_user?.full_name ? ` · ${payment.created_by_user.full_name}` : ""}
              </Text>
            </View>
          </View>
        );
      })}
      {refunds.map((refund, index) => (
        <View
          key={`ref-${index}`}
          style={twStyle("mb-2 flex-row items-start justify-between rounded-lg bg-orange-50 px-3 py-2")}
        >
          <View style={twStyle("flex-1")}>
            <Text style={twStyle("text-sm font-semibold text-orange-900")}>
              Refund −{formatCurrency(Number(refund.amount ?? 0), currency)}
              {(refund.refund_method ?? "").toLowerCase() === "cash" ? " (in person)" : " (wallet)"}
              {(refund.status ?? "").toLowerCase() === "pending" ? " · awaiting confirmation" : ""}
            </Text>
            <Text style={twStyle("mt-0.5 text-xs text-orange-800")}>
              {formatWhen(refund.created_at)}
              {refund.reason ? ` · ${refund.reason}` : ""}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}
