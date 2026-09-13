/**
 * Client retention: completed visits, repeat share, period-over-period cohort overlap.
 */
import { useCallback } from "react";
import { View, Text } from "react-native";
import { useTranslation } from "@beautonomi/i18n";
import { ReportPayloadView } from "@/features/reports/ReportPayloadView";
import { formatPercentage } from "@/lib/format";
import { twStyle } from "@/lib/twStyle";

function omitKeys(obj: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (keys.includes(k)) continue;
    next[k] = v;
  }
  return next;
}

function isRetentionPayload(data: unknown): data is {
  totalClients?: number;
  newClients?: number;
  returningClients?: number;
  overallRetentionRate?: number;
  averageVisitsPerClient?: number;
  retentionByPeriod?: {
    period: string;
    retentionRate: number;
    clients?: number;
    clientsInPriorPeriod?: number;
    returnedFromPriorPeriod?: number;
  }[];
  periodGranularity?: string;
  analysisFromYmd?: string;
  analysisToYmd?: string;
  basisNote?: string;
  timezone?: string;
} {
  return data != null && typeof data === "object" && !Array.isArray(data) && "retentionByPeriod" in data;
}

export function ClientRetentionReportView({ data }: { data: unknown }) {
  const { t } = useTranslation();
  const cr = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t("provider.mobile.screens.clientRetentionReport." + key, opts) as string,
    [t],
  );

  if (!isRetentionPayload(data)) {
    return <ReportPayloadView data={data} />;
  }

  const formatPeriodLabel = (periodStr: string, granularity: string): string => {
    if (granularity === "month") {
      const [y, m] = periodStr.split("-");
      if (y && m) return `${y}-${m}`;
      return periodStr;
    }
    if (granularity === "quarter") {
      const match = periodStr.match(/^(\d{4})-Q(\d)$/);
      if (match) return cr("quarterLabel", { quarter: match[2], year: match[1] });
      return periodStr;
    }
    return periodStr;
  };

  const basis = data.basisNote ?? "";
  const total = Number(data.totalClients ?? 0);
  const single = Number(data.newClients ?? 0);
  const repeat = Number(data.returningClients ?? 0);
  const overall = Number(data.overallRetentionRate ?? 0);
  const avgV = Number(data.averageVisitsPerClient ?? 0);
  const rows = data.retentionByPeriod ?? [];
  const gran = data.periodGranularity ?? "month";
  const empty = cr("emptyValue");

  const detailPayload = omitKeys(data as Record<string, unknown>, [
    "retentionByPeriod",
    "basisNote",
    "reportBasis",
    "timezone",
    "totalClients",
    "newClients",
    "returningClients",
    "overallRetentionRate",
    "averageVisitsPerClient",
    "periodGranularity",
    "analysisFromYmd",
    "analysisToYmd",
    "monthsOfHistory",
  ]);

  return (
    <View style={twStyle("gap-5 pb-8")}>
      <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>
        {cr("factsDefinitions")}
      </Text>
      {basis ? (
        <View style={twStyle("rounded-2xl border border-sky-100 bg-sky-50/95 px-4 py-3")}>
          <Text style={twStyle("text-sm leading-5 text-sky-950")}>{basis}</Text>
          {data.analysisFromYmd && data.analysisToYmd ? (
            <Text style={twStyle("mt-2 text-xs text-sky-900/85")}>
              {data.timezone
                ? cr("windowRangeTz", {
                    from: data.analysisFromYmd,
                    to: data.analysisToYmd,
                    timezone: data.timezone,
                  })
                : cr("windowRange", { from: data.analysisFromYmd, to: data.analysisToYmd })}
            </Text>
          ) : null}
        </View>
      ) : null}

      <View style={twStyle("flex-row flex-wrap gap-3")}>
        <View style={twStyle("min-w-[148px] flex-1 rounded-2xl border border-blue-100 bg-blue-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-blue-900")}>{cr("distinctClients")}</Text>
          <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-blue-950")}>{total}</Text>
        </View>
        <View style={twStyle("min-w-[148px] flex-1 rounded-2xl border border-amber-100 bg-amber-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-amber-900")}>{cr("singleVisit")}</Text>
          <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-amber-950")}>{single}</Text>
        </View>
        <View style={twStyle("min-w-[148px] flex-1 rounded-2xl border border-emerald-100 bg-emerald-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-emerald-900")}>{cr("repeatTwoPlus")}</Text>
          <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-emerald-950")}>{repeat}</Text>
        </View>
        <View style={twStyle("min-w-[148px] flex-1 rounded-2xl border border-rose-100 bg-rose-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-rose-900")}>{cr("repeatShare")}</Text>
          <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-rose-950")}>
            {formatPercentage(overall)}
          </Text>
        </View>
      </View>

      <View style={twStyle("rounded-2xl border border-gray-100 bg-white px-4 py-3")}>
        <Text style={twStyle("text-xs text-gray-600")}>{cr("avgVisits")}</Text>
        <Text style={twStyle("mt-1 text-lg font-semibold tabular-nums text-gray-900")}>{avgV.toFixed(2)}</Text>
      </View>

      <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>
        {cr("periodVsPrior")}
      </Text>
      <View style={twStyle("rounded-2xl border border-gray-100 bg-white")}>
        {rows.length === 0 ? (
          <Text style={twStyle("px-4 py-6 text-center text-sm text-gray-500")}>
            {cr("emptyBuckets")}
          </Text>
        ) : (
          rows.map((r) => (
            <View
              key={r.period}
              style={twStyle("border-b border-gray-50 px-4 py-3 last:border-b-0")}
            >
              <Text style={twStyle("text-sm font-semibold text-gray-900")}>
                {formatPeriodLabel(r.period, gran)}
              </Text>
              <Text style={twStyle("text-xs text-gray-600")}>
                {cr("retentionRow", {
                  rate: r.retentionRate.toFixed(1),
                  prior: r.clientsInPriorPeriod ?? empty,
                  returned: r.returnedFromPriorPeriod ?? empty,
                  bucket: r.clients ?? empty,
                })}
              </Text>
            </View>
          ))
        )}
      </View>

      {Object.keys(detailPayload).length > 0 ? (
        <ReportPayloadView data={detailPayload} title={cr("extra")} />
      ) : null}
    </View>
  );
}
