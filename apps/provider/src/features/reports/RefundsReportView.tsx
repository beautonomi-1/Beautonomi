/**
 * Refunds: ledger refund rows + provider earnings reversals (facts-first).
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

const METHOD_LABEL: Record<string, string> = {
  ledger: "Ledger (no booking link)",
  product_order: "Retail / product order",
  paystack: "Paystack",
  yoco: "Yoco",
  stripe: "Stripe",
  cash: "Cash",
  card: "Card",
  wallet: "Wallet",
  bank_transfer: "Bank transfer",
  other: "Other",
};

function formatMethod(m: string): string {
  return METHOD_LABEL[m] ?? m.replace(/_/g, " ");
}

function isRefundsPayload(data: unknown): data is Record<string, unknown> & {
  totalRefunds?: number;
  totalRefundAmount?: number;
  refundShareOfPaymentLedgerPercent?: number;
  refundRate?: number;
  methodBreakdown?: { method: string; count: number; amount: number; percentage?: number }[];
  reportBasis?: string;
  timezone?: string;
  providerEarningsReversed?: number;
  totalPaymentLedgerAmount?: number;
  totalPaymentAmount?: number;
} {
  return data != null && typeof data === "object" && !Array.isArray(data) && "totalRefunds" in data;
}

export function RefundsReportView({ data }: { data: unknown }) {
  if (!isRefundsPayload(data)) {
    return <ReportPayloadView data={data} />;
  }

  const basis = typeof data.reportBasis === "string" ? data.reportBasis : "";
  const tz = typeof data.timezone === "string" ? data.timezone : "";
  const count = Number(data.totalRefunds ?? 0);
  const gross = Number(data.totalRefundAmount ?? 0);
  const rev = Number(data.providerEarningsReversed ?? 0);
  const payLedger = Number(data.totalPaymentLedgerAmount ?? data.totalPaymentAmount ?? 0);
  const share =
    Number(data.refundShareOfPaymentLedgerPercent ?? data.refundRate ?? 0);
  const avg = count > 0 ? gross / count : 0;
  const methods = (data.methodBreakdown ?? []).filter((m) => Number(m.amount) > 0);

  const detailPayload = omitKeys(data as Record<string, unknown>, [
    "methodBreakdown",
    "dailyBreakdown",
    "recentRefunds",
    "reportBasis",
    "timezone",
    "locationAttribution",
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
        <View style={twStyle("min-w-[148px] flex-1 rounded-2xl border border-rose-100 bg-rose-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-rose-900")}>Refund rows</Text>
          <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-rose-950")}>{count}</Text>
        </View>
        <View style={twStyle("min-w-[148px] flex-1 rounded-2xl border border-red-100 bg-red-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-red-900")}>Customer refund gross</Text>
          <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-red-950")}>
            {formatCurrency(gross)}
          </Text>
        </View>
      </View>

      <View style={twStyle("flex-row flex-wrap gap-3")}>
        <View style={twStyle("min-w-[148px] flex-1 rounded-2xl border border-violet-100 bg-violet-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-violet-900")}>Provider earnings reversal</Text>
          <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-violet-950")}>
            {formatCurrency(rev)}
          </Text>
        </View>
        <View style={twStyle("min-w-[148px] flex-1 rounded-2xl border border-amber-100 bg-amber-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-amber-900")}>Refund ÷ payment ledger</Text>
          <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-amber-950")}>
            {formatPercentage(share)}
          </Text>
          <Text style={twStyle("mt-1 text-[11px] text-amber-900/85")}>
            Denominator: payment rows in same period ({formatCurrency(payLedger)})
          </Text>
        </View>
      </View>

      <View style={twStyle("rounded-2xl border border-gray-100 bg-white px-4 py-3")}>
        <Text style={twStyle("text-xs text-gray-600")}>Avg refund (customer gross)</Text>
        <Text style={twStyle("mt-1 text-lg font-semibold tabular-nums text-gray-900")}>
          {formatCurrency(avg)}
        </Text>
      </View>

      {methods.length > 0 ? (
        <View>
          <Text style={twStyle("mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500")}>
            By recorded path
          </Text>
          <View style={twStyle("rounded-2xl border border-gray-100 bg-white")}>
            {methods.map((m) => (
              <View
                key={m.method}
                style={twStyle("flex-row justify-between border-b border-gray-50 px-4 py-3 last:border-b-0")}
              >
                <Text style={twStyle("text-sm text-gray-900")}>{formatMethod(m.method)}</Text>
                <Text style={twStyle("text-sm font-semibold tabular-nums text-gray-900")}>
                  {formatCurrency(Number(m.amount))}{" "}
                  <Text style={twStyle("text-xs font-normal text-gray-500")}>
                    ({m.count}){m.percentage != null ? ` · ${m.percentage.toFixed(0)}%` : ""}
                  </Text>
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {Array.isArray(data.recentRefunds) && data.recentRefunds.length > 0 ? (
        <View>
          <Text style={twStyle("mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500")}>
            Recent refund rows
          </Text>
          <View style={twStyle("rounded-2xl border border-gray-100 bg-white")}>
            {(data.recentRefunds as { id?: string; amount?: number; created_at?: string; reason?: string; paymentMethodLabel?: string }[]).map((r) => (
              <View
                key={String(r.id)}
                style={twStyle("border-b border-gray-50 px-4 py-3 last:border-b-0")}
              >
                <Text style={twStyle("text-sm font-medium text-gray-900")}>
                  {formatCurrency(Number(r.amount ?? 0))}
                  {r.paymentMethodLabel ? (
                    <Text style={twStyle("text-xs font-normal text-gray-500")}>
                      {" "}
                      · {formatMethod(r.paymentMethodLabel)}
                    </Text>
                  ) : null}
                </Text>
                {r.reason ? (
                  <Text style={twStyle("mt-1 text-xs text-gray-600")} numberOfLines={2}>
                    {r.reason}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {Object.keys(detailPayload).length > 0 ? <ReportPayloadView data={detailPayload} title="Details" /> : null}
    </View>
  );
}
