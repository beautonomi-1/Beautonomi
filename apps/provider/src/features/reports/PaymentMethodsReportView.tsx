/**
 * Payment methods: settlement-window mix (gateways, till logs, wallet splits).
 */
import { View, Text } from "react-native";
import { ReportPayloadView } from "@/features/reports/ReportPayloadView";
import { formatCurrency, formatPercentage } from "@/lib/format";
import { twStyle } from "@/lib/twStyle";

type MethodRow = {
  method: string;
  label?: string;
  totalCount: number;
  totalAmount: number;
  paymentTransactionCount?: number;
  paymentTransactionAmount?: number;
  bookingPaymentCount?: number;
  bookingPaymentAmount?: number;
  walletBookingAdjustmentCount?: number;
  walletBookingAdjustmentAmount?: number;
  averageAmount: number;
  percentage: number;
};

function isPaymentMethodsPayload(data: unknown): data is {
  methods: MethodRow[];
  totalAmount: number;
  totalLineItems?: number;
  totalPayments?: number;
  reportBasis?: string;
  timezone?: string;
  fromYmd?: string;
  toYmd?: string;
  diagnostics?: {
    failedCaptureAttemptsInRange?: number;
    failedCaptureAttemptsAttributed?: number;
  };
} {
  if (data == null || typeof data !== "object" || Array.isArray(data)) return false;
  const o = data as Record<string, unknown>;
  return Array.isArray(o.methods) && typeof o.totalAmount === "number";
}

export function PaymentMethodsReportView({ data }: { data: unknown }) {
  if (!isPaymentMethodsPayload(data)) {
    return <ReportPayloadView data={data} />;
  }

  const basis = typeof data.reportBasis === "string" ? data.reportBasis : "";
  const tz = typeof data.timezone === "string" ? data.timezone : "";
  const range =
    typeof data.fromYmd === "string" && typeof data.toYmd === "string"
      ? `${data.fromYmd} → ${data.toYmd}`
      : "";
  const totalLineItems = Number(data.totalLineItems ?? data.totalPayments ?? 0);
  const totalAmt = Number(data.totalAmount ?? 0);
  const methods = (data.methods ?? []).filter((m) => Number(m.totalAmount) > 0 || Number(m.totalCount) > 0);

  const failedTotal = data.diagnostics?.failedCaptureAttemptsInRange ?? 0;
  const failedAttrib = data.diagnostics?.failedCaptureAttemptsAttributed ?? 0;

  return (
    <View style={twStyle("gap-5 pb-8")}>
      <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>
        Facts & definitions
      </Text>
      {basis ? (
        <View style={twStyle("rounded-2xl border border-sky-100 bg-sky-50/95 px-4 py-3")}>
          <Text style={twStyle("text-sm leading-5 text-sky-950")}>{basis}</Text>
          {tz ? <Text style={twStyle("mt-2 text-xs text-sky-900/85")}>Timezone · {tz}</Text> : null}
          {range ? <Text style={twStyle("mt-1 text-xs text-sky-900/85")}>Range · {range}</Text> : null}
        </View>
      ) : null}

      <View style={twStyle("flex-row flex-wrap gap-3")}>
        <View style={twStyle("min-w-[148px] flex-1 rounded-2xl border border-indigo-100 bg-indigo-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-indigo-900")}>Settlement line items</Text>
          <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-indigo-950")}>{totalLineItems}</Text>
          <Text style={twStyle("mt-1 text-[11px] leading-4 text-indigo-900/85")}>
            Captures and completed till logs in range.
          </Text>
        </View>
        <View style={twStyle("min-w-[148px] flex-1 rounded-2xl border border-emerald-100 bg-emerald-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-emerald-900")}>Total attributed</Text>
          <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-emerald-950")}>
            {formatCurrency(totalAmt)}
          </Text>
          <Text style={twStyle("mt-1 text-[11px] leading-4 text-emerald-900/85")}>
            Uses capture timestamps, not appointment dates.
          </Text>
        </View>
      </View>

      {failedTotal > 0 ? (
        <View style={twStyle("rounded-2xl border border-amber-200 bg-amber-50/95 px-4 py-3")}>
          <Text style={twStyle("text-sm font-medium text-amber-950")}>Failed gateway captures in window</Text>
          <Text style={twStyle("mt-1 text-sm leading-5 text-amber-950/95")}>
            {failedTotal} failed payment_transaction rows in range
            {typeof failedAttrib === "number" ? ` (${failedAttrib} linked to your bookings).` : "."} Excluded from
            totals above.
          </Text>
        </View>
      ) : null}

      <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>By method</Text>
      {methods.map((m) => {
        const label = m.label ?? m.method;
        const ptN = m.paymentTransactionCount ?? 0;
        const bpN = m.bookingPaymentCount ?? 0;
        const wN = m.walletBookingAdjustmentCount ?? 0;
        const parts: string[] = [];
        if (ptN > 0) {
          parts.push(
            `${ptN} gateway row${ptN === 1 ? "" : "s"}${m.paymentTransactionAmount ? ` · ${formatCurrency(Number(m.paymentTransactionAmount))}` : ""}`,
          );
        }
        if (bpN > 0) {
          parts.push(
            `${bpN} till log${bpN === 1 ? "" : "s"}${m.bookingPaymentAmount ? ` · ${formatCurrency(Number(m.bookingPaymentAmount))}` : ""}`,
          );
        }
        if (wN > 0) {
          parts.push(
            `${wN} wallet split${wN === 1 ? "" : "s"}${m.walletBookingAdjustmentAmount ? ` · ${formatCurrency(Number(m.walletBookingAdjustmentAmount))}` : ""}`,
          );
        }
        const detail =
          parts.length > 0 ? parts.join(" · ") : `${m.totalCount} line item${m.totalCount === 1 ? "" : "s"}`;

        return (
          <View
            key={m.method}
            style={twStyle("rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-sm")}
          >
            <View style={twStyle("flex-row items-start justify-between gap-2")}>
              <Text style={twStyle("flex-1 text-base font-semibold text-gray-900")}>{label}</Text>
              <Text style={twStyle("text-sm tabular-nums text-gray-600")}>{formatPercentage(m.percentage)}</Text>
            </View>
            <Text style={twStyle("mt-2 text-lg font-semibold tabular-nums text-gray-900")}>
              {formatCurrency(m.totalAmount)}
            </Text>
            <Text style={twStyle("mt-1 text-xs leading-5 text-gray-500")}>{detail}</Text>
            <Text style={twStyle("mt-2 text-xs text-gray-400")}>
              Avg {formatCurrency(m.averageAmount)} · {m.totalCount} lines
            </Text>
            <View style={twStyle("mt-3 h-2 overflow-hidden rounded-full bg-gray-100")}>
              <View
                style={[
                  twStyle("h-full rounded-full bg-indigo-500"),
                  { width: `${Math.min(100, Math.max(0, m.percentage))}%` },
                ]}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}
