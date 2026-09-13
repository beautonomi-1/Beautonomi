/**
 * Sales Summary: dual headline — ledger net vs recorded takings (cash-register style).
 */
import { View, Text } from "react-native";
import { useTranslation } from "@beautonomi/i18n";
import { ReportPayloadView } from "@/features/reports/ReportPayloadView";
import { formatCurrency } from "@/lib/format";
import { twStyle } from "@/lib/twStyle";

function omitKeys(obj: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (keys.includes(k)) continue;
    next[k] = v;
  }
  return next;
}

type RecordedTakingsPayload = {
  total?: number;
  byPaymentMethod?: Record<string, number>;
  bookingPaymentsTotal?: number;
  walletTotal?: number;
  retailAndLegacySalesTotal?: number;
  tipsTotal?: number;
  cancellationFeesTotal?: number;
};

function isSalesSummaryPayload(data: unknown): data is Record<string, unknown> & {
  totalRevenue?: number;
  recordedTakings?: RecordedTakingsPayload;
  recordedTakingsBasisNote?: string;
} {
  return (
    data != null &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    "totalRevenue" in data &&
    "recordedTakings" in data
  );
}

export function SalesSummaryReportView({ data }: { data: unknown }) {
  const { t } = useTranslation();
  const ss = (key: string) => t(`provider.mobile.screens.salesSummaryReport.${key}`) as string;

  if (!isSalesSummaryPayload(data)) {
    return <ReportPayloadView data={data} />;
  }

  const rt = data.recordedTakings;
  const ledgerTotal = Number(data.totalRevenue ?? 0);
  const recordedTotal = Number(rt?.total ?? 0);
  const basis = data.recordedTakingsBasisNote ?? "";

  const methods = Object.entries(rt?.byPaymentMethod ?? {})
    .filter(([, amt]) => Number(amt) > 0.005)
    .sort((a, b) => Number(b[1]) - Number(a[1]));

  const detailPayload = omitKeys(data as Record<string, unknown>, ["recordedTakings", "recordedTakingsBasisNote"]);

  return (
    <View>
      <View style={twStyle("mb-5 gap-3")}>
        <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>
          {ss("howToRead")}
        </Text>
        <View style={twStyle("flex-row flex-wrap gap-3")}>
          <View
            style={twStyle("min-w-[140px] flex-1 rounded-2xl border border-indigo-100 bg-indigo-50/80 px-4 py-3")}
          >
            <Text style={twStyle("text-xs font-medium text-indigo-900")}>{ss("ledgerNet")}</Text>
            <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-indigo-950")}>
              {formatCurrency(ledgerTotal)}
            </Text>
            <Text style={twStyle("mt-1 text-[11px] leading-4 text-indigo-800/90")}>
              {ss("ledgerNetHint")}
            </Text>
          </View>
          <View
            style={twStyle("min-w-[140px] flex-1 rounded-2xl border border-emerald-100 bg-emerald-50/80 px-4 py-3")}
          >
            <Text style={twStyle("text-xs font-medium text-emerald-900")}>{ss("recordedTakings")}</Text>
            <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-emerald-950")}>
              {formatCurrency(recordedTotal)}
            </Text>
            <Text style={twStyle("mt-1 text-[11px] leading-4 text-emerald-900/90")}>
              {ss("recordedTakingsHint")}
            </Text>
          </View>
        </View>

        {basis ? (
          <Text style={twStyle("text-xs leading-5 text-gray-600")}>{basis}</Text>
        ) : null}

        {methods.length > 0 ? (
          <View style={twStyle("rounded-2xl border border-gray-100 bg-white px-4 py-3")}>
            <Text style={twStyle("mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500")}>
              {ss("takingsByMethod")}
            </Text>
            {methods.map(([method, amt]) => (
              <View
                key={method}
                style={twStyle("flex-row items-center justify-between border-b border-gray-50 py-2 last:border-b-0")}
              >
                <Text style={twStyle("text-sm capitalize text-gray-700")}>{method.replace(/_/g, " ")}</Text>
                <Text style={twStyle("text-sm font-medium tabular-nums text-gray-900")}>
                  {formatCurrency(Number(amt))}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={twStyle("rounded-xl bg-gray-50 px-3 py-2")}>
          <Text style={twStyle("text-[11px] leading-4 text-gray-600")}>
            {ss("readHint")}
          </Text>
        </View>
      </View>

      <ReportPayloadView data={detailPayload} />
    </View>
  );
}
