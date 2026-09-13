/**
 * Payment methods: settlement-window mix (gateways, till logs, wallet splits).
 */
import { View, Text } from "react-native";
import { useTranslation } from "@beautonomi/i18n";
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
  const { t } = useTranslation();
  const pm = (key: string, opts?: Record<string, unknown>) =>
    t(`provider.mobile.screens.paymentMethodsReport.${key}`, opts) as string;

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
        {pm("factsDefinitions")}
      </Text>
      {basis ? (
        <View style={twStyle("rounded-2xl border border-sky-100 bg-sky-50/95 px-4 py-3")}>
          <Text style={twStyle("text-sm leading-5 text-sky-950")}>{basis}</Text>
          {tz ? <Text style={twStyle("mt-2 text-xs text-sky-900/85")}>{pm("timezone", { tz })}</Text> : null}
          {range ? <Text style={twStyle("mt-1 text-xs text-sky-900/85")}>{pm("range", { range })}</Text> : null}
        </View>
      ) : null}

      <View style={twStyle("flex-row flex-wrap gap-3")}>
        <View style={twStyle("min-w-[148px] flex-1 rounded-2xl border border-indigo-100 bg-indigo-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-indigo-900")}>{pm("settlementLineItems")}</Text>
          <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-indigo-950")}>{totalLineItems}</Text>
          <Text style={twStyle("mt-1 text-[11px] leading-4 text-indigo-900/85")}>
            {pm("settlementHint")}
          </Text>
        </View>
        <View style={twStyle("min-w-[148px] flex-1 rounded-2xl border border-emerald-100 bg-emerald-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-emerald-900")}>{pm("totalAttributed")}</Text>
          <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-emerald-950")}>
            {formatCurrency(totalAmt)}
          </Text>
          <Text style={twStyle("mt-1 text-[11px] leading-4 text-emerald-900/85")}>
            {pm("totalAttributedHint")}
          </Text>
        </View>
      </View>

      {failedTotal > 0 ? (
        <View style={twStyle("rounded-2xl border border-amber-200 bg-amber-50/95 px-4 py-3")}>
          <Text style={twStyle("text-sm font-medium text-amber-950")}>{pm("failedCapturesTitle")}</Text>
          <Text style={twStyle("mt-1 text-sm leading-5 text-amber-950/95")}>
            {pm("failedCaptures", {
              count: failedTotal,
              attrib: typeof failedAttrib === "number" ? pm("failedCapturesAttrib", { count: failedAttrib }) : "",
            })}
          </Text>
        </View>
      ) : null}

      <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>{pm("byMethod")}</Text>
      {methods.map((m) => {
        const label = m.label ?? m.method;
        const ptN = m.paymentTransactionCount ?? 0;
        const bpN = m.bookingPaymentCount ?? 0;
        const wN = m.walletBookingAdjustmentCount ?? 0;
        const parts: string[] = [];
        if (ptN > 0) {
          parts.push(
            pm("gatewayRows", {
              count: ptN,
              amountSuffix: m.paymentTransactionAmount
                ? pm("amountSuffix", { amount: formatCurrency(Number(m.paymentTransactionAmount)) })
                : "",
            }),
          );
        }
        if (bpN > 0) {
          parts.push(
            pm("tillLogs", {
              count: bpN,
              amountSuffix: m.bookingPaymentAmount
                ? pm("amountSuffix", { amount: formatCurrency(Number(m.bookingPaymentAmount)) })
                : "",
            }),
          );
        }
        if (wN > 0) {
          parts.push(
            pm("walletSplits", {
              count: wN,
              amountSuffix: m.walletBookingAdjustmentAmount
                ? pm("amountSuffix", { amount: formatCurrency(Number(m.walletBookingAdjustmentAmount)) })
                : "",
            }),
          );
        }
        const detail = parts.length > 0 ? parts.join(" · ") : pm("lineItems", { count: m.totalCount });

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
              {pm("avgLines", { amount: formatCurrency(m.averageAmount), count: m.totalCount })}
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
