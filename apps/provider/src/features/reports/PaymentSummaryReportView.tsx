/**
 * Payment summary: booked value vs ledger-settled customer funds, provider activity.
 */
import { View, Text } from "react-native";
import { ReportPayloadView } from "@/features/reports/ReportPayloadView";
import { formatCurrency, formatPercentage } from "@/lib/format";
import { twStyle } from "@/lib/twStyle";

function omitKeys(obj: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (keys.includes(k)) continue;
    next[k] = v;
  }
  return next;
}

function isPaymentSummaryPayload(data: unknown): data is Record<string, unknown> & {
  grossBookedValue?: number;
  totalAmount?: number;
  settledLedgerAmount?: number;
  totalCollected?: number;
  providerNetActivity?: number;
  netAmount?: number;
  refundedAmount?: number;
  refundRate?: number;
  paymentsByMethod?: Array<{ method: string; count: number; amount: number; percentage?: number }>;
  reportBasis?: string;
  timezone?: string;
  pendingPayments?: number;
  failedPayments?: number;
  gatewayChargeCount?: number;
  successfulPayments?: number;
  averageBookedValueNonPending?: number;
  averageTransactionValue?: number;
  cashStylePaymentsWithoutLedgerCount?: number;
  cashStylePaymentsWithoutLedgerAmount?: number;
  collectionBreakdown?: Record<string, unknown>;
} {
  return data != null && typeof data === "object" && !Array.isArray(data) && "collectionBreakdown" in data;
}

export function PaymentSummaryReportView({ data }: { data: unknown }) {
  if (!isPaymentSummaryPayload(data)) {
    return <ReportPayloadView data={data} />;
  }

  const gross = Number(data.grossBookedValue ?? data.totalAmount ?? 0);
  const settled = Number(data.settledLedgerAmount ?? data.totalCollected ?? 0);
  const providerNet = Number(data.providerNetActivity ?? data.netAmount ?? 0);
  const refunded = Number(data.refundedAmount ?? 0);
  const refundRate = Number(data.refundRate ?? 0);
  const basis = data.reportBasis ?? "";
  const tz = data.timezone ?? "";
  const methods = (data.paymentsByMethod ?? []).filter((m) => Number(m.amount) > 0);
  const avgBooked = Number(data.averageBookedValueNonPending ?? data.averageTransactionValue ?? 0);

  const detailPayload = omitKeys(data as Record<string, unknown>, [
    "grossBookedValue",
    "totalAmount",
    "settledLedgerAmount",
    "totalCollected",
    "providerNetActivity",
    "netAmount",
    "refundedAmount",
    "refundRate",
    "paymentsByMethod",
    "paymentsByStatus",
    "reportBasis",
    "timezone",
    "basis",
    "locationAttribution",
    "collectionBreakdown",
  ]);

  return (
    <View style={twStyle("gap-5 pb-8")}>
      <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>
        Facts & definitions
      </Text>
      {basis ? (
        <View style={twStyle("rounded-2xl border border-sky-100 bg-sky-50/95 px-4 py-3")}>
          <Text style={twStyle("text-sm leading-5 text-sky-950")}>{basis}</Text>
          {tz ? <Text style={twStyle("mt-2 text-xs text-sky-900/85")}>Timezone · {tz}</Text> : null}
        </View>
      ) : null}

      <View style={twStyle("flex-row flex-wrap gap-3")}>
        <View style={twStyle("min-w-[148px] flex-1 rounded-2xl border border-emerald-100 bg-emerald-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-emerald-900")}>Gross booked value</Text>
          <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-emerald-950")}>
            {formatCurrency(gross)}
          </Text>
          <Text style={twStyle("mt-1 text-[11px] leading-4 text-emerald-900/85")}>
            Scheduled appointments in range (excl. cancelled).
          </Text>
        </View>
        <View style={twStyle("min-w-[148px] flex-1 rounded-2xl border border-blue-100 bg-blue-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-blue-900")}>Customer funds settled</Text>
          <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-blue-950")}>
            {formatCurrency(settled)}
          </Text>
          <Text style={twStyle("mt-1 text-[11px] leading-4 text-blue-900/85")}>
            Ledger in settlement window — splits vs wallet-only deduped server-side.
          </Text>
        </View>
      </View>

      <View style={twStyle("flex-row flex-wrap gap-3")}>
        <View style={twStyle("min-w-[148px] flex-1 rounded-2xl border border-violet-100 bg-violet-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-violet-900")}>Provider net activity</Text>
          <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-violet-950")}>
            {formatCurrency(providerNet)}
          </Text>
        </View>
        <View style={twStyle("min-w-[148px] flex-1 rounded-2xl border border-rose-100 bg-rose-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-rose-900")}>Refunded</Text>
          <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-rose-950")}>
            {formatCurrency(refunded)}
          </Text>
          <Text style={twStyle("mt-1 text-[11px] text-rose-900/85")}>
            Refund rate {formatPercentage(refundRate)}
          </Text>
        </View>
      </View>

      <View style={twStyle("rounded-2xl border border-gray-100 bg-white px-4 py-3")}>
        <Text style={twStyle("text-xs text-gray-600")}>Avg gross booked / booking (non-pending)</Text>
        <Text style={twStyle("mt-1 text-lg font-semibold tabular-nums text-gray-900")}>
          {formatCurrency(avgBooked)}
        </Text>
      </View>

      {(data.pendingPayments ?? 0) > 0 || (data.failedPayments ?? 0) > 0 ? (
        <View style={twStyle("rounded-2xl border border-amber-100 bg-amber-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-amber-950")}>Booking payment status</Text>
          <Text style={twStyle("mt-1 text-sm text-amber-950/95")}>
            Pending {data.pendingPayments ?? 0} · Failed {data.failedPayments ?? 0}
          </Text>
          <Text style={twStyle("mt-2 text-[11px] leading-4 text-amber-900/90")}>
            Successful payment_transactions rows: {data.successfulPayments ?? 0} (includes terminal /
            wallet-settlement refs). Card-terminal captures: {data.gatewayChargeCount ?? 0}.
          </Text>
        </View>
      ) : null}

      {(data.cashStylePaymentsWithoutLedgerCount ?? 0) > 0 ? (
        <View style={twStyle("rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3")}>
          <Text style={twStyle("text-xs font-semibold text-amber-950")}>Cash / walk-in without ledger row</Text>
          <Text style={twStyle("mt-1 text-sm text-amber-950")}>
            {data.cashStylePaymentsWithoutLedgerCount} payment
            {data.cashStylePaymentsWithoutLedgerCount === 1 ? "" : "s"} · approx{" "}
            {formatCurrency(data.cashStylePaymentsWithoutLedgerAmount ?? 0)}
          </Text>
        </View>
      ) : null}

      {methods.length > 0 ? (
        <View>
          <Text style={twStyle("mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500")}>
            Mix by method (booking payments)
          </Text>
          <View style={twStyle("rounded-2xl border border-gray-100 bg-white")}>
            {methods.map((m) => (
              <View
                key={m.method}
                style={twStyle("flex-row justify-between border-b border-gray-50 px-4 py-3 last:border-b-0")}
              >
                <Text style={twStyle("text-sm capitalize text-gray-900")}>{m.method.replace(/_/g, " ")}</Text>
                <Text style={twStyle("text-sm font-semibold tabular-nums text-gray-900")}>
                  {formatCurrency(Number(m.amount))}{" "}
                  <Text style={twStyle("text-xs font-normal text-gray-500")}>
                    ({m.count} rows{m.percentage != null ? ` · ${m.percentage.toFixed(0)}%` : ""})
                  </Text>
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {Object.keys(detailPayload).length > 0 ? <ReportPayloadView data={detailPayload} title="Details" /> : null}
    </View>
  );
}
