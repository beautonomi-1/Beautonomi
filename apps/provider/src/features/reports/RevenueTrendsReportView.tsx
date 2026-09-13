/**
 * Revenue trends: ledger net vs scheduled visits with factual basis copy.
 */
import { View, Text } from "react-native";
import { useTranslation } from "@beautonomi/i18n";
import { ReportPayloadView } from "@/features/reports/ReportPayloadView";
import { ReportResponsiveStatRow } from "@/components/reports/ReportResponsiveStatRow";
import { StatCard } from "@/components/ui/StatCard";
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

const MONTH_KEYS = [
  "monthJan",
  "monthFeb",
  "monthMar",
  "monthApr",
  "monthMay",
  "monthJun",
  "monthJul",
  "monthAug",
  "monthSep",
  "monthOct",
  "monthNov",
  "monthDec",
] as const;

function formatBucket(
  periodStr: string,
  gran: string | undefined,
  rv: (key: string, opts?: Record<string, unknown>) => string,
): string {
  if (!gran) return periodStr;
  if (gran === "month" && /^\d{4}-\d{2}$/.test(periodStr)) {
    const [y, m] = periodStr.split("-");
    const mi = parseInt(m, 10);
    if (!Number.isFinite(mi) || mi < 1 || mi > 12) return periodStr;
    return rv("monthYear", { month: rv(MONTH_KEYS[mi - 1]), year: y });
  }
  if (gran === "year") return periodStr.slice(0, 4);
  if (gran === "week" && /^\d{4}-\d{2}-\d{2}$/.test(periodStr)) {
    return rv("weekBucket", { period: periodStr });
  }
  return periodStr;
}

type TrendsPayload = {
  period?: string;
  trends?: { period: string; revenue: number; bookings: number }[];
  totalRevenue?: number;
  totalBookings?: number;
  averageRevenue?: number;
  revenueGrowth?: number;
  bookingsGrowth?: number;
  priorBucketComparison?: {
    revenueChangePct: number;
    bookingsChangePct: number;
    previousPeriod: string;
    currentPeriod: string;
  };
  dateRange?: { fromYmd: string; toYmd: string; timezone: string };
  basisNote?: string;
  ledgerTransactionTypes?: string[];
};

function isTrendsPayload(data: unknown): data is TrendsPayload {
  return data != null && typeof data === "object" && !Array.isArray(data) && "trends" in data;
}

export function RevenueTrendsReportView({ data }: { data: unknown }) {
  const { t } = useTranslation();
  const rv = (key: string, opts?: Record<string, unknown>) =>
    t(`provider.mobile.screens.revenueTrendsReport.${key}`, opts) as string;

  if (!isTrendsPayload(data)) {
    return <ReportPayloadView data={data} />;
  }

  const trends = Array.isArray(data.trends) ? data.trends : [];
  const maxRev = Math.max(...trends.map((t) => t.revenue), 1);
  const gran = data.period;
  const range = data.dateRange;
  const prior = data.priorBucketComparison;

  const detailPayload = omitKeys(data as Record<string, unknown>, [
    "trends",
    "basisNote",
    "ledgerTransactionTypes",
    "priorBucketComparison",
    "dateRange",
    "reportBasis",
    "period",
    "totalRevenue",
    "totalBookings",
    "averageRevenue",
    "revenueGrowth",
    "bookingsGrowth",
  ]);
  const hasExtraScalars = Object.keys(detailPayload).length > 0;

  return (
    <View>
      <View style={twStyle("mb-4 rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2.5")}>
        <Text style={twStyle("text-xs leading-5 text-indigo-950")}>
          {rv("basisIntro")}
        </Text>
      </View>

      {data.basisNote ? (
        <Text style={twStyle("mb-4 text-xs leading-5 text-gray-600")}>{data.basisNote}</Text>
      ) : null}

      {range ? (
        <Text style={twStyle("mb-3 text-xs text-gray-500")}>
          {rv("dateRange", { from: range.fromYmd, to: range.toYmd, tz: range.timezone.replace(/_/g, " ") })}
        </Text>
      ) : null}

      <ReportResponsiveStatRow>
        <StatCard
          title={rv("ledgerNet")}
          value={formatCurrency(data.totalRevenue ?? 0)}
          icon="wallet-outline"
          iconColor="#7c3aed"
          iconBg="bg-violet-50"
          compact
        />
        <StatCard
          title={rv("visits")}
          value={String(data.totalBookings ?? 0)}
          icon="calendar-outline"
          iconColor="#0d9488"
          iconBg="bg-teal-50"
          compact
        />
        <StatCard
          title={rv("avgBucket")}
          value={formatCurrency(data.averageRevenue ?? 0)}
          icon="albums-outline"
          iconColor="#d97706"
          iconBg="bg-amber-50"
          compact
        />
        <StatCard
          title={rv("deltaPriorBucket")}
          value={
            prior
              ? `${(data.revenueGrowth ?? 0) >= 0 ? "+" : ""}${(data.revenueGrowth ?? 0).toFixed(1)}%`
              : rv("emptyValue")
          }
          icon="trending-up"
          iconColor="#059669"
          iconBg="bg-emerald-50"
          compact
        />
      </ReportResponsiveStatRow>

      {prior ? (
        <Text style={twStyle("mt-2 text-[11px] text-gray-500")}>
          {rv("vsPrior", {
            previous: formatBucket(prior.previousPeriod, gran, rv),
            current: formatBucket(prior.currentPeriod, gran, rv),
          })}
        </Text>
      ) : null}

      {trends.length > 0 ? (
        <View style={twStyle("mt-5")}>
          <Text style={twStyle("mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500")}>{rv("byBucket")}</Text>
          <View style={twStyle("rounded-2xl border border-gray-100 bg-white px-3 py-2")}>
            {trends.map((row, i) => {
              const pct = maxRev > 0 ? (row.revenue / maxRev) * 100 : 0;
              return (
                <View key={`${row.period}-${i}`} style={twStyle("border-b border-gray-50 py-2.5 last:border-b-0")}>
                  <View style={twStyle("mb-1 flex-row justify-between gap-2")}>
                    <Text style={twStyle("flex-1 text-sm font-medium text-gray-900")} numberOfLines={2}>
                      {formatBucket(row.period, gran, rv)}
                    </Text>
                    <Text style={twStyle("text-sm font-semibold tabular-nums text-gray-900")}>
                      {formatCurrency(row.revenue)}
                    </Text>
                  </View>
                  <Text style={twStyle("mb-2 text-xs text-gray-500")}>
                    {rv("visitCount", { count: row.bookings })}
                  </Text>
                  <View style={twStyle("h-2 overflow-hidden rounded-full bg-gray-100")}>
                    <View style={[{ width: `${Math.max(pct, 2)}%` }, twStyle("h-full rounded-full bg-violet-500")]} />
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      {hasExtraScalars ? (
        <View style={twStyle("mt-6")}>
          <ReportPayloadView data={detailPayload} />
        </View>
      ) : null}
    </View>
  );
}
