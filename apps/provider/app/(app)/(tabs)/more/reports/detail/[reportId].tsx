/**
 * Native report detail: GET `/api/provider/reports/...` with the same query contracts as the web portal.
 */
import { useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Share,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi } from "@/hooks/useApi";
import { useProvider } from "@/providers/ProviderContext";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ErrorState } from "@/components/ui/ErrorState";
import { FilterChipGroup } from "@/components/ui/FilterChip";
import { ReportPayloadView } from "@/features/reports/ReportPayloadView";
import {
  REPORT_DETAIL_REGISTRY,
  type ReportDetailDefinition,
  type ReportQueryMode,
} from "@/features/reports/reportDetailRegistry";
import { twStyle } from "@/lib/twStyle";
import { Colors } from "@/constants/colors";

type DateRange = "today" | "week" | "month" | "last_month" | "3months";

const DATE_RANGES: { label: string; value: DateRange }[] = [
  { label: "Today", value: "today" },
  { label: "This Week", value: "week" },
  { label: "This Month", value: "month" },
  { label: "Last Month", value: "last_month" },
  { label: "3 Months", value: "3months" },
];

const PERIOD_MQY = [
  { label: "Month", value: "month" },
  { label: "Quarter", value: "quarter" },
  { label: "Year", value: "year" },
];

const PERIOD_DMWY = [
  { label: "Day", value: "day" },
  { label: "Week", value: "week" },
  { label: "Month", value: "month" },
  { label: "Year", value: "year" },
];

function getDateParams(range: DateRange): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().split("T")[0];
  let from = to;
  if (range === "week") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    from = d.toISOString().split("T")[0];
  } else if (range === "month") {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 1);
    from = d.toISOString().split("T")[0];
  } else if (range === "last_month") {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 1);
    from = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split("T")[0];
    return { from, to: new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split("T")[0] };
  } else if (range === "3months") {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 3);
    from = d.toISOString().split("T")[0];
  }
  return { from, to };
}

function buildReportUrl(
  def: Pick<ReportDetailDefinition, "apiPath" | "query" | "extraSearch">,
  opts: {
    from: string;
    to: string;
    period: string;
    date: string;
    locationId: string | null;
  },
): string {
  const loc = opts.locationId ? `&location_id=${encodeURIComponent(opts.locationId)}` : "";
  const extra = def.extraSearch
    ? def.extraSearch({
        from: opts.from,
        to: opts.to,
        period: opts.period,
        date: opts.date,
      })
    : "";

  switch (def.query) {
    case "none":
      return opts.locationId
        ? `/api/provider/reports/${def.apiPath}?location_id=${encodeURIComponent(opts.locationId)}`
        : `/api/provider/reports/${def.apiPath}`;
    case "fromTo":
      return `/api/provider/reports/${def.apiPath}?from=${opts.from}&to=${opts.to}${loc}${extra}`;
    case "periodMQY":
      return `/api/provider/reports/${def.apiPath}?period=${encodeURIComponent(opts.period)}${loc}`;
    case "periodDMWY":
      return `/api/provider/reports/${def.apiPath}?period=${encodeURIComponent(opts.period)}${loc}`;
    case "singleDate":
      return `/api/provider/reports/${def.apiPath}?date=${encodeURIComponent(opts.date)}${loc}`;
    default:
      return `/api/provider/reports/${def.apiPath}`;
  }
}

export default function ReportDetailScreen() {
  const router = useRouter();
  const { reportId: rawId } = useLocalSearchParams<{ reportId: string | string[] }>();
  const reportId = Array.isArray(rawId) ? rawId[0] : rawId;
  const def = reportId ? REPORT_DETAIL_REGISTRY[reportId] : undefined;

  const { selectedLocationId } = useProvider();
  const [dateRange, setDateRange] = useState<DateRange>("month");
  const [periodMQY, setPeriodMQY] = useState("month");
  const [periodDMWY, setPeriodDMWY] = useState("month");
  const [eodDate, setEodDate] = useState(() => new Date().toISOString().split("T")[0]);

  const { from, to } = useMemo(() => getDateParams(dateRange), [dateRange]);

  const path = useMemo(() => {
    if (!def) return "";
    return buildReportUrl(def, {
      from,
      to,
      period: def.query === "periodDMWY" ? periodDMWY : periodMQY,
      date: eodDate,
      locationId: selectedLocationId,
    });
  }, [def, from, to, periodMQY, periodDMWY, eodDate, selectedLocationId]);

  const { data, loading, error, refresh } = useApi<unknown>(path, { enabled: !!def && !!path });

  const handleShare = useCallback(async () => {
    if (data == null) return;
    try {
      await Share.share({
        title: def?.title ?? "Report",
        message: typeof data === "object" ? JSON.stringify(data, null, 2) : String(data),
      });
    } catch {
      /* ignore */
    }
  }, [data, def?.title]);

  if (!reportId || !def) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Report" showBack />
        <ErrorState message="Unknown report." onRetry={() => router.back()} retryLabel="Back" />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader
        title={def.title}
        showBack
        subtitle={def.subtitle}
        rightAction={
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              void handleShare();
            }}
            style={twStyle("h-10 w-10 items-center justify-center rounded-full bg-gray-100")}
            accessibilityLabel="Share report data"
          >
            <Ionicons name="share-outline" size={18} color="#374151" />
          </TouchableOpacity>
        }
      />

      {def.query === "fromTo" && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={twStyle("mb-4")} contentContainerStyle={{ flexDirection: "row" }}>
          {DATE_RANGES.map((r) => (
            <TouchableOpacity
              key={r.value}
              style={[twStyle(`rounded-full px-4 py-2 ${dateRange === r.value ? "bg-gray-900" : "border border-gray-200 bg-white"}`), { marginRight: 8 }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setDateRange(r.value);
              }}
            >
              <Text style={twStyle(`text-sm font-medium ${dateRange === r.value ? "text-white" : "text-gray-600"}`)}>{r.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {def.query === "periodMQY" && (
        <View style={twStyle("mb-4")}>
          <FilterChipGroup options={PERIOD_MQY} selected={periodMQY} onSelect={setPeriodMQY} />
        </View>
      )}

      {def.query === "periodDMWY" && (
        <View style={twStyle("mb-4")}>
          <FilterChipGroup options={PERIOD_DMWY} selected={periodDMWY} onSelect={setPeriodDMWY} />
        </View>
      )}

      {def.query === "singleDate" && (
        <View style={twStyle("mb-4 flex-row flex-wrap items-center gap-2")}>
          <Text style={twStyle("text-sm text-gray-600")}>Date</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {DATE_RANGES.map((r) => (
              <TouchableOpacity
                key={r.value}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  const d = getDateParams(r.value);
                  setEodDate(d.to);
                }}
                style={[twStyle("mr-2 rounded-full border border-gray-200 bg-white px-3 py-1.5")]}
              >
                <Text style={twStyle("text-xs text-gray-700")}>{r.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {loading && !data && <ActivityIndicator style={twStyle("my-8")} color={Colors.primary} />}
      {error && !data && <ErrorState message={error} onRetry={refresh} />}

      {data != null && !loading && (
        <ScrollView style={twStyle("flex-1")} showsVerticalScrollIndicator={false}>
          <ReportPayloadView data={data} />
        </ScrollView>
      )}
    </ScreenContainer>
  );
}
