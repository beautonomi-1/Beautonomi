/**
 * Payment summary: booked value vs ledger-settled customer funds, provider activity.
 */
import { useCallback } from "react";
import { View, Text } from "react-native";
import { useTranslation } from "@beautonomi/i18n";
import { ReportPayloadView } from "@/features/reports/ReportPayloadView";
import { formatCurrency, formatPercentage } from "@/lib/format";
import { twStyle } from "@/lib/twStyle";

const METHOD_KEYS: Record<string, string> = {
  cash: "methodCash",
  card: "methodCard",
  bank_transfer: "methodBankTransfer",
  paystack: "methodPaystack",
  yoco: "methodYoco",
  paycloud: "methodPaycloud",
  gift_card: "methodGiftCard",
  wallet: "methodWallet",
  other: "methodOther",
  cashback: "methodCashback",
};

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
  paymentsByMethod?: { method: string; count: number; amount: number; percentage?: number }[];
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
  const { t } = useTranslation();
  const ps = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t("provider.mobile.screens.paymentSummaryReport." + key, opts) as string,
    [t],
  );

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
        {ps("factsDefinitions")}
      </Text>
      {basis ? (
        <View style={twStyle("rounded-2xl border border-sky-100 bg-sky-50/95 px-4 py-3")}>
          <Text style={twStyle("text-sm leading-5 text-sky-950")}>{basis}</Text>
          {tz ? <Text style={twStyle("mt-2 text-xs text-sky-900/85")}>{ps("timezone", { tz })}</Text> : null}
        </View>
      ) : null}

      <View style={twStyle("flex-row flex-wrap gap-3")}>
        <View style={twStyle("min-w-[148px] flex-1 rounded-2xl border border-emerald-100 bg-emerald-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-emerald-900")}>{ps("grossBooked")}</Text>
          <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-emerald-950")}>
            {formatCurrency(gross)}
          </Text>
          <Text style={twStyle("mt-1 text-[11px] leading-4 text-emerald-900/85")}>
            {ps("grossBookedHint")}
          </Text>
        </View>
        <View style={twStyle("min-w-[148px] flex-1 rounded-2xl border border-blue-100 bg-blue-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-blue-900")}>{ps("fundsSettled")}</Text>
          <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-blue-950")}>
            {formatCurrency(settled)}
          </Text>
          <Text style={twStyle("mt-1 text-[11px] leading-4 text-blue-900/85")}>
            {ps("fundsSettledHint")}
          </Text>
        </View>
      </View>

      <View style={twStyle("flex-row flex-wrap gap-3")}>
        <View style={twStyle("min-w-[148px] flex-1 rounded-2xl border border-violet-100 bg-violet-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-violet-900")}>{ps("providerNet")}</Text>
          <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-violet-950")}>
            {formatCurrency(providerNet)}
          </Text>
        </View>
        <View style={twStyle("min-w-[148px] flex-1 rounded-2xl border border-rose-100 bg-rose-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-rose-900")}>{ps("refunded")}</Text>
          <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-rose-950")}>
            {formatCurrency(refunded)}
          </Text>
          <Text style={twStyle("mt-1 text-[11px] text-rose-900/85")}>
            {ps("refundRate", { rate: formatPercentage(refundRate) })}
          </Text>
        </View>
      </View>

      <View style={twStyle("rounded-2xl border border-gray-100 bg-white px-4 py-3")}>
        <Text style={twStyle("text-xs text-gray-600")}>{ps("avgGrossBooked")}</Text>
        <Text style={twStyle("mt-1 text-lg font-semibold tabular-nums text-gray-900")}>
          {formatCurrency(avgBooked)}
        </Text>
      </View>

      {(data.pendingPayments ?? 0) > 0 || (data.failedPayments ?? 0) > 0 ? (
        <View style={twStyle("rounded-2xl border border-amber-100 bg-amber-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-amber-950")}>{ps("bookingPaymentStatus")}</Text>
          <Text style={twStyle("mt-1 text-sm text-amber-950/95")}>
            {ps("pendingFailed", { pending: data.pendingPayments ?? 0, failed: data.failedPayments ?? 0 })}
          </Text>
          <Text style={twStyle("mt-2 text-[11px] leading-4 text-amber-900/90")}>
            {ps("successfulPayments", {
              success: data.successfulPayments ?? 0,
              gateway: data.gatewayChargeCount ?? 0,
            })}
          </Text>
        </View>
      ) : null}

      {(data.cashStylePaymentsWithoutLedgerCount ?? 0) > 0 ? (
        <View style={twStyle("rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3")}>
          <Text style={twStyle("text-xs font-semibold text-amber-950")}>{ps("cashWithoutLedgerTitle")}</Text>
          <Text style={twStyle("mt-1 text-sm text-amber-950")}>
            {ps("cashWithoutLedger", {
              count: data.cashStylePaymentsWithoutLedgerCount,
              amount: formatCurrency(data.cashStylePaymentsWithoutLedgerAmount ?? 0),
            })}
          </Text>
        </View>
      ) : null}

      {methods.length > 0 ? (
        <View>
          <Text style={twStyle("mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500")}>
            {ps("mixByMethod")}
          </Text>
          <View style={twStyle("rounded-2xl border border-gray-100 bg-white")}>
            {methods.map((m) => (
              <View
                key={m.method}
                style={twStyle("flex-row justify-between border-b border-gray-50 px-4 py-3 last:border-b-0")}
              >
                <Text style={twStyle("text-sm text-gray-900")}>
                  {METHOD_KEYS[m.method] ? ps(METHOD_KEYS[m.method]) : m.method.replace(/_/g, " ")}
                </Text>
                <Text style={twStyle("text-sm font-semibold tabular-nums text-gray-900")}>
                  {formatCurrency(Number(m.amount))}{" "}
                  <Text style={twStyle("text-xs font-normal text-gray-500")}>
                    {m.percentage != null
                      ? ps("methodRowsPct", { count: m.count, pct: m.percentage.toFixed(0) })
                      : ps("methodRows", { count: m.count })}
                  </Text>
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {Object.keys(detailPayload).length > 0 ? <ReportPayloadView data={detailPayload} title={ps("details")} /> : null}
    </View>
  );
}
