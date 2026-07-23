/**
 * End of day: recorded takings by payment method (cash-register style).
 */
import { View, Text } from "react-native";
import { ReportPayloadView } from "@/features/reports/ReportPayloadView";
import { formatCurrency } from "@/lib/format";
import { twStyle } from "@/lib/twStyle";

const METHOD_LABEL: Record<string, string> = {
  cash: "Cash",
  card: "Card",
  bank_transfer: "Bank transfer",
  paystack: "Paystack",
  yoco: "Yoco",
  paycloud: "Card machine",
  gift_card: "Gift card",
  wallet: "Wallet",
  other: "Other",
  cashback: "Cashback",
};

function omitKeys(obj: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (keys.includes(k)) continue;
    next[k] = v;
  }
  return next;
}

function isEndOfDayPayload(data: unknown): data is Record<string, unknown> & {
  date?: string;
  total?: number;
  byPaymentMethod?: Record<string, number>;
  timezone?: string;
  reportBasis?: string;
} {
  return (
    data != null &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    "byPaymentMethod" in data &&
    "bookingPaymentsTotal" in data
  );
}

export function EndOfDayReportView({ data }: { data: unknown }) {
  if (!isEndOfDayPayload(data)) {
    return <ReportPayloadView data={data} />;
  }

  const total = Number(data.total ?? 0);
  const basis = typeof data.reportBasis === "string" ? data.reportBasis : "";
  const tz = typeof data.timezone === "string" ? data.timezone : "";
  const date = typeof data.date === "string" ? data.date : "";
  const by = data.byPaymentMethod ?? {};
  const methods = Object.entries(by)
    .map(([k, v]) => ({ key: k, amount: Number(v ?? 0) }))
    .filter((r) => r.amount > 0.005)
    .sort((a, b) => b.amount - a.amount);

  const detailPayload = omitKeys(data as Record<string, unknown>, [
    "byPaymentMethod",
    "total",
    "reportBasis",
    "timezone",
    "date",
    "note",
  ]);

  return (
    <View style={twStyle("gap-5 pb-8")}>
      <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>
        Facts & definitions
      </Text>
      {basis ? (
        <View style={twStyle("rounded-2xl border border-sky-100 bg-sky-50/95 px-4 py-3")}>
          <Text style={twStyle("text-sm leading-5 text-sky-950")}>{basis}</Text>
          {(date || tz) && (
            <Text style={twStyle("mt-2 text-xs text-sky-900/85")}>
              {date ? `Day ${date}` : ""}
              {date && tz ? " · " : ""}
              {tz || ""}
            </Text>
          )}
        </View>
      ) : null}

      <View style={twStyle("rounded-2xl border border-emerald-100 bg-emerald-50/90 px-4 py-4")}>
        <Text style={twStyle("text-xs font-medium text-emerald-900")}>Total recorded takings</Text>
        <Text style={twStyle("mt-1 text-2xl font-semibold tabular-nums text-emerald-950")}>
          {formatCurrency(total)}
        </Text>
      </View>

      <View style={twStyle("flex-row flex-wrap gap-3")}>
        <View style={twStyle("min-w-[140px] flex-1 rounded-2xl border border-gray-100 bg-white px-4 py-3")}>
          <Text style={twStyle("text-xs text-gray-600")}>Booking payments (completed rows)</Text>
          <Text style={twStyle("mt-1 text-lg font-semibold tabular-nums text-gray-900")}>
            {formatCurrency(Number((data as { bookingPaymentsTotal?: number }).bookingPaymentsTotal ?? 0))}
          </Text>
        </View>
        <View style={twStyle("min-w-[140px] flex-1 rounded-2xl border border-gray-100 bg-white px-4 py-3")}>
          <Text style={twStyle("text-xs text-gray-600")}>Wallet (split-safe)</Text>
          <Text style={twStyle("mt-1 text-lg font-semibold tabular-nums text-gray-900")}>
            {formatCurrency(Number((data as { walletTotal?: number }).walletTotal ?? 0))}
          </Text>
        </View>
        <View style={twStyle("min-w-[140px] flex-1 rounded-2xl border border-gray-100 bg-white px-4 py-3")}>
          <Text style={twStyle("text-xs text-gray-600")}>Retail / legacy sales</Text>
          <Text style={twStyle("mt-1 text-lg font-semibold tabular-nums text-gray-900")}>
            {formatCurrency(Number((data as { salesTotal?: number }).salesTotal ?? 0))}
          </Text>
        </View>
      </View>

      <View style={twStyle("flex-row flex-wrap gap-3")}>
        <View style={twStyle("min-w-[140px] flex-1 rounded-2xl border border-amber-50 bg-amber-50/80 px-4 py-3")}>
          <Text style={twStyle("text-xs text-amber-900")}>Tips (ledger)</Text>
          <Text style={twStyle("mt-1 text-lg font-semibold tabular-nums text-amber-950")}>
            {formatCurrency(Number((data as { tipsTotal?: number }).tipsTotal ?? 0))}
          </Text>
        </View>
        <View style={twStyle("min-w-[140px] flex-1 rounded-2xl border border-orange-50 bg-orange-50/80 px-4 py-3")}>
          <Text style={twStyle("text-xs text-orange-900")}>Cancellation fees kept</Text>
          <Text style={twStyle("mt-1 text-lg font-semibold tabular-nums text-orange-950")}>
            {formatCurrency(Number((data as { cancellationFeesTotal?: number }).cancellationFeesTotal ?? 0))}
          </Text>
        </View>
      </View>

      {Number((data as { cashbackTotal?: number }).cashbackTotal ?? 0) > 0 ? (
        <View style={twStyle("rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3")}>
          <Text style={twStyle("text-xs text-slate-700")}>
            Cashback (till cash-out) — not included in recorded total
          </Text>
          <Text style={twStyle("mt-1 text-lg font-semibold tabular-nums text-slate-950")}>
            {formatCurrency(Number((data as { cashbackTotal?: number }).cashbackTotal ?? 0))}
          </Text>
        </View>
      ) : null}

      {methods.length > 0 ? (
        <View>
          <Text style={twStyle("mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500")}>
            By payment method
          </Text>
          <View style={twStyle("rounded-2xl border border-gray-100 bg-white")}>
            {methods.map((m) => (
              <View
                key={m.key}
                style={twStyle("flex-row justify-between border-b border-gray-50 px-4 py-3 last:border-b-0")}
              >
                <Text style={twStyle("text-sm text-gray-900")}>{METHOD_LABEL[m.key] ?? m.key}</Text>
                <Text style={twStyle("text-sm font-semibold tabular-nums text-gray-900")}>
                  {formatCurrency(m.amount)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {typeof data.note === "string" && data.note.trim() ? (
        <Text style={twStyle("text-xs leading-5 text-gray-600")}>{data.note}</Text>
      ) : null}

      {Object.keys(detailPayload).length > 0 ? <ReportPayloadView data={detailPayload} title="Details" /> : null}
    </View>
  );
}
