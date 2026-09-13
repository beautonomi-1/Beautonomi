/**
 * Period comparison: current period-to-date vs complete prior calendar period.
 */
import { View, Text } from "react-native";
import { useTranslation } from "@beautonomi/i18n";
import { ReportPayloadView } from "@/features/reports/ReportPayloadView";
import { formatCurrency } from "@/lib/format";
import { twStyle } from "@/lib/twStyle";

type Col = {
  revenue?: number;
  ledgerFromBookings?: number;
  ledgerFromProductOrders?: number;
  bookings?: number;
  completed?: number;
  clients?: number;
  averageLedgerPerScheduledBooking?: number;
  averageValue?: number;
};

function isComparisonPayload(data: unknown): data is {
  timezone?: string;
  reportBasis?: string;
  basis?: Record<string, string>;
  windows?: {
    current?: { fromYmd?: string; toYmd?: string; description?: string };
    previous?: { fromYmd?: string; toYmd?: string; description?: string };
  };
  current?: Col;
  previous?: Col;
  growth?: {
    revenue?: number;
    bookings?: number;
    clients?: number;
    averageLedgerPerScheduledBooking?: number;
  };
} {
  return data != null && typeof data === "object" && !Array.isArray(data) && "current" in data && "previous" in data;
}

const BASIS_LABEL_KEYS: Record<string, string> = {
  currentWindow: "basisCurrent",
  previousWindow: "basisPrevious",
  ledgerHeadline: "basisLedger",
  averagePerBooking: "basisAvgBooking",
  bookings: "basisBookings",
  growth: "basisGrowth",
};

function GrowthText({ v, label }: { v: number; label: string }) {
  const up = v >= 0;
  return (
    <Text style={twStyle(`text-sm font-semibold ${up ? "text-green-700" : "text-red-600"}`)}>
      {label}
    </Text>
  );
}

export function PeriodComparisonReportView({ data }: { data: unknown }) {
  const { t } = useTranslation();
  const pc = (key: string, opts?: Record<string, unknown>) =>
    t(`provider.mobile.screens.periodComparisonReport.${key}`, opts) as string;

  if (!isComparisonPayload(data)) {
    return <ReportPayloadView data={data} />;
  }

  const c = data.current ?? {};
  const p = data.previous ?? {};
  const g = data.growth ?? {};

  const curAvg = Number(c.averageLedgerPerScheduledBooking ?? c.averageValue ?? 0);
  const prevAvg = Number(p.averageLedgerPerScheduledBooking ?? p.averageValue ?? 0);
  const avgG =
    typeof g.averageLedgerPerScheduledBooking === "number"
      ? g.averageLedgerPerScheduledBooking
      : prevAvg > 0
        ? ((curAvg - prevAvg) / prevAvg) * 100
        : 0;

  const basisText = typeof data.reportBasis === "string" ? data.reportBasis : "";
  const basisEntries = data.basis
    ? Object.entries(data.basis).filter(([, v]) => typeof v === "string" && String(v).trim())
    : [];

  const wc = data.windows?.current;
  const wp = data.windows?.previous;
  const growthLabel = (v: number) =>
    pc("growthVsPrevious", { sign: v >= 0 ? "+" : "", value: v.toFixed(1) });

  return (
    <View style={twStyle("gap-5 pb-8")}>
      <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>
        {pc("factsDefinitions")}
      </Text>

      {wc?.fromYmd && wc?.toYmd ? (
        <View style={twStyle("rounded-xl border border-gray-100 bg-gray-50 px-4 py-3")}>
          <Text style={twStyle("text-sm text-gray-800")}>
            {pc("currentLine", {
              from: wc.fromYmd,
              to: wc.toYmd,
              description: wc.description ? pc("descriptionSuffix", { description: wc.description }) : "",
            })}
          </Text>
          {wp?.fromYmd && wp?.toYmd ? (
            <Text style={twStyle("mt-1 text-sm text-gray-800")}>
              {pc("previousLine", {
                from: wp.fromYmd,
                to: wp.toYmd,
                description: wp.description ? pc("descriptionSuffix", { description: wp.description }) : "",
              })}
            </Text>
          ) : null}
          {data.timezone ? (
            <Text style={twStyle("mt-2 text-xs text-gray-600")}>{pc("timezone", { tz: data.timezone })}</Text>
          ) : null}
        </View>
      ) : null}

      {basisText ? (
        <View style={twStyle("rounded-2xl border border-sky-100 bg-sky-50/95 px-4 py-3")}>
          <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-sky-900")}>
            {pc("whatThisCompares")}
          </Text>
          <Text style={twStyle("mt-2 text-sm leading-5 text-sky-950")}>{basisText}</Text>
        </View>
      ) : null}

      {basisEntries.length > 0 ? (
        <View style={twStyle("rounded-2xl border border-violet-100 bg-violet-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-violet-900")}>
            {pc("definitions")}
          </Text>
          {basisEntries.map(([k, v]) => (
            <Text key={k} style={twStyle("mt-2 text-sm leading-5 text-violet-950")}>
              <Text style={twStyle("font-medium")}>
                {pc("basisItem", { label: BASIS_LABEL_KEYS[k] ? pc(BASIS_LABEL_KEYS[k]) : k })}
              </Text>
              {v}
            </Text>
          ))}
        </View>
      ) : null}

      <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>{pc("ledgerEarnings")}</Text>
      <View style={twStyle("rounded-2xl border border-emerald-100 bg-emerald-50/80 px-4 py-3")}>
        <Text style={twStyle("text-sm text-emerald-900")}>{pc("currentAmount", { amount: formatCurrency(Number(c.revenue ?? 0)) })}</Text>
        <Text style={twStyle("mt-1 text-sm text-emerald-900")}>{pc("previousAmount", { amount: formatCurrency(Number(p.revenue ?? 0)) })}</Text>
        <View style={twStyle("mt-2")}>
          <GrowthText v={Number(g.revenue ?? 0)} label={growthLabel(Number(g.revenue ?? 0))} />
        </View>
      </View>

      <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>{pc("scheduledBookings")}</Text>
      <View style={twStyle("rounded-2xl border border-gray-100 bg-white px-4 py-3")}>
        <Text style={twStyle("text-sm text-gray-900")}>
          {pc("currentBookings", { count: Number(c.bookings ?? 0), completed: Number(c.completed ?? 0) })}
        </Text>
        <Text style={twStyle("mt-1 text-sm text-gray-700")}>
          {pc("previousBookings", { count: Number(p.bookings ?? 0), completed: Number(p.completed ?? 0) })}
        </Text>
        <View style={twStyle("mt-2")}>
          <GrowthText v={Number(g.bookings ?? 0)} label={growthLabel(Number(g.bookings ?? 0))} />
        </View>
      </View>

      <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>{pc("distinctClients")}</Text>
      <View style={twStyle("rounded-2xl border border-gray-100 bg-gray-50/90 px-4 py-3")}>
        <Text style={twStyle("text-sm text-gray-900")}>{pc("currentCount", { count: Number(c.clients ?? 0) })}</Text>
        <Text style={twStyle("mt-1 text-sm text-gray-700")}>{pc("previousCount", { count: Number(p.clients ?? 0) })}</Text>
        <View style={twStyle("mt-2")}>
          <GrowthText v={Number(g.clients ?? 0)} label={growthLabel(Number(g.clients ?? 0))} />
        </View>
      </View>

      <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>
        {pc("avgLedgerPerBooking")}
      </Text>
      <View style={twStyle("rounded-2xl border border-indigo-100 bg-indigo-50/85 px-4 py-3")}>
        <Text style={twStyle("text-sm text-indigo-950")}>{pc("currentAmount", { amount: formatCurrency(curAvg) })}</Text>
        <Text style={twStyle("mt-1 text-sm text-indigo-900")}>{pc("previousAmount", { amount: formatCurrency(prevAvg) })}</Text>
        <View style={twStyle("mt-2")}>
          <GrowthText v={avgG} label={growthLabel(avgG)} />
        </View>
      </View>
    </View>
  );
}
