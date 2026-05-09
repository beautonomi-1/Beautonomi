/**
 * Payout earnings (ledger): provider_earnings in the settlement window — not bank payouts.
 */
import { View, Text } from "react-native";
import { ReportPayloadView } from "@/features/reports/ReportPayloadView";
import { formatCurrency } from "@/lib/format";
import { twStyle } from "@/lib/twStyle";
import { format } from "date-fns";

function isPayoutsPayload(data: unknown): data is {
  totalPayouts: number;
  totalPayoutAmount: number;
  totalBookedAmount?: number;
  totalGrossAmount?: number;
  totalBookedNetOfRefunds?: number;
  totalPlatformFees: number;
  totalRefunded: number;
  averagePayout: number;
  platformFeeRate: number;
  monthlyBreakdown: Array<{ month: string; count: number; amount: number }>;
  recentPayouts: Array<{
    bookingId?: string | null;
    productOrderId?: string;
    grossAmount: number;
    bookedAmount?: number;
    payoutAmount: number;
    platformFee: number;
    refundedAmount?: number;
    createdAt: string;
    ledgerSettlementAt?: string;
    referenceLabel?: string;
  }>;
  reportBasis?: string;
  timezone?: string;
  fromYmd?: string;
  toYmd?: string;
  basis?: Record<string, string>;
} {
  return data != null && typeof data === "object" && !Array.isArray(data) && "totalPayoutAmount" in data;
}

export function PayoutsReportView({ data }: { data: unknown }) {
  if (!isPayoutsPayload(data)) {
    return <ReportPayloadView data={data} />;
  }

  const basis = typeof data.reportBasis === "string" ? data.reportBasis : "";
  const tz = typeof data.timezone === "string" ? data.timezone : "";
  const range =
    typeof data.fromYmd === "string" && typeof data.toYmd === "string"
      ? `${data.fromYmd} → ${data.toYmd}`
      : "";
  const booked =
    Number(data.totalBookedAmount ?? data.totalGrossAmount ?? 0);
  const bookedNet =
    Number(data.totalBookedNetOfRefunds ?? Math.max(0, booked - Number(data.totalRefunded ?? 0)));
  const feePct = Number(data.platformFeeRate ?? 0);

  const basisLabels: Record<string, string> = {
    headlineTotal: "Headline total",
    bookedAmount: "Booked amount",
    payoutAmountPerRow: "Earnings per row",
    platformFeesAndRefunds: "Fees & refunds",
    notIncluded: "Not included",
  };
  const basisEntries = data.basis
    ? Object.entries(data.basis).filter(([, v]) => typeof v === "string" && String(v).trim())
    : [];

  return (
    <View style={twStyle("gap-5 pb-8")}>
      <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>
        Facts & definitions
      </Text>
      {basis ? (
        <View style={twStyle("rounded-2xl border border-sky-100 bg-sky-50/95 px-4 py-3")}>
          <Text style={twStyle("text-sm leading-5 text-sky-950")}>{basis}</Text>
          {tz ? <Text style={twStyle("mt-2 text-xs text-sky-900/85")}>Timezone · {tz}</Text> : null}
          {range ? <Text style={twStyle("mt-1 text-xs text-sky-900/85")}>Ledger window · {range}</Text> : null}
        </View>
      ) : null}

      {basisEntries.length > 0 ? (
        <View style={twStyle("rounded-2xl border border-violet-100 bg-violet-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-violet-900")}>Definitions</Text>
          {basisEntries.map(([k, v]) => (
            <Text key={k} style={twStyle("mt-2 text-sm leading-5 text-violet-950")}>
              <Text style={twStyle("font-medium")}>{basisLabels[k] ?? k} · </Text>
              {v}
            </Text>
          ))}
        </View>
      ) : null}

      <View style={twStyle("flex-row flex-wrap gap-3")}>
        <View style={twStyle("min-w-[148px] flex-1 rounded-2xl border border-indigo-100 bg-indigo-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-indigo-900")}>Ledger rows</Text>
          <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-indigo-950")}>{data.totalPayouts}</Text>
        </View>
        <View style={twStyle("min-w-[148px] flex-1 rounded-2xl border border-emerald-100 bg-emerald-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-emerald-900")}>Net earnings</Text>
          <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-emerald-950")}>
            {formatCurrency(data.totalPayoutAmount)}
          </Text>
        </View>
      </View>

      <View style={twStyle("flex-row flex-wrap gap-3")}>
        <View style={twStyle("min-w-[148px] flex-1 rounded-2xl border border-blue-100 bg-blue-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-blue-900")}>Booked net of refunds</Text>
          <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-blue-950")}>
            {formatCurrency(bookedNet)}
          </Text>
        </View>
        <View style={twStyle("min-w-[148px] flex-1 rounded-2xl border border-amber-100 bg-amber-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-amber-900")}>Fees vs booked</Text>
          <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-amber-950")}>{feePct.toFixed(1)}%</Text>
          <Text style={twStyle("mt-1 text-[11px] text-amber-900/85")}>Share of gross booked</Text>
        </View>
      </View>

      <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>
        Ledger earnings by month
      </Text>
      {(data.monthlyBreakdown ?? []).map((m) => {
        const parts = m.month.split("-");
        const title =
          parts.length >= 2
            ? format(new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, 1), "MMMM yyyy")
            : m.month;
        return (
          <View
            key={m.month}
            style={twStyle("flex-row items-center justify-between rounded-2xl border border-gray-100 bg-white px-4 py-3")}
          >
            <View>
              <Text style={twStyle("font-medium text-gray-900")}>{title}</Text>
              <Text style={twStyle("text-xs text-gray-500")}>{m.count} rows</Text>
            </View>
            <Text style={twStyle("font-semibold tabular-nums text-gray-900")}>{formatCurrency(m.amount)}</Text>
          </View>
        );
      })}

      <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>Recent rows</Text>
      {(data.recentPayouts ?? []).slice(0, 15).map((p) => {
        const when = p.ledgerSettlementAt ?? p.createdAt;
        const label = p.referenceLabel ?? (p.productOrderId ? "Retail order" : "Booking");
        return (
          <View
            key={`${p.bookingId ?? ""}-${p.productOrderId ?? ""}-${when}`}
            style={twStyle("rounded-2xl border border-gray-100 bg-white px-4 py-3")}
          >
            <Text style={twStyle("font-medium text-gray-900")}>{label}</Text>
            <Text style={twStyle("text-xs text-gray-500")}>
              {when ? format(new Date(when), "MMM d, yyyy · HH:mm") : ""}
            </Text>
            <Text style={twStyle("mt-1 text-sm font-semibold text-emerald-800")}>
              {formatCurrency(p.payoutAmount)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
