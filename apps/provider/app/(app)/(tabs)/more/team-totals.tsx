/**
 * Native Team Totals – daily and weekly performance for staff.
 * Full parity with web: date/week navigation, staff filter, stats cards, table.
 */
import { useCallback, useState, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { format, startOfWeek, endOfWeek, addDays, subDays } from "date-fns";
import { useApi } from "@/hooks/useApi";
import { useProvider } from "@/providers/ProviderContext";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { useResponsive } from "@/hooks/useResponsive";
import { twStyle } from "@/lib/twStyle";
import { appendReportLocation } from "@/lib/reportLocationQuery";

interface StaffTotalsItem {
  team_member_id: string;
  team_member_name: string;
  appointments_count: number;
  revenue: number;
  tips: number;
  hours_worked: number;
  commission: number;
  rating?: number;
}

interface StaffMember {
  id: string;
  name: string;
  is_active?: boolean;
}

export default function TeamTotalsScreen() {
  const router = useRouter();
  const { selectedLocationId } = useProvider();
  const { screenPadding } = useResponsive();
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<"daily" | "weekly">("daily");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>("all");

  const dateStr = format(selectedDate, "yyyy-MM-dd");
  const weekStartStr = format(weekStart, "yyyy-MM-dd");
  const weekEndStr = format(endOfWeek(weekStart, { weekStartsOn: 1 }), "yyyy-MM-dd");

  const totalsParams =
    period === "daily"
      ? `date=${dateStr}&period=daily`
      : `start_date=${weekStartStr}&end_date=${weekEndStr}&period=weekly`;
  const totalsPath =
    selectedMemberId && selectedMemberId !== "all"
      ? appendReportLocation(`/api/provider/staff/${selectedMemberId}/totals?${totalsParams}`, selectedLocationId)
      : appendReportLocation(`/api/provider/staff/totals?${totalsParams}`, selectedLocationId);

  const { data: staffData } = useApi<StaffMember[] | { staff?: StaffMember[] }>("/api/provider/staff");
  const { data: totalsData, loading, error, refresh } = useApi<StaffTotalsItem[]>(totalsPath);

  const staffList: StaffMember[] = useMemo(() => {
    const raw = staffData;
    if (Array.isArray(raw)) return raw.filter((s) => s.is_active !== false);
    const arr = (raw as { staff?: StaffMember[] })?.staff;
    return Array.isArray(arr) ? arr.filter((s) => s.is_active !== false) : [];
  }, [staffData]);

  const totals: StaffTotalsItem[] = useMemo(() => {
    const raw = totalsData;
    if (raw == null) return [];
    if (Array.isArray(raw)) return raw;
    return (raw as { data?: StaffTotalsItem[] })?.data ?? [];
  }, [totalsData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const goPrev = useCallback(() => {
    if (period === "daily") {
      setSelectedDate((d) => subDays(d, 1));
    } else {
      setWeekStart((w) => subDays(w, 7));
    }
  }, [period]);

  const goNext = useCallback(() => {
    if (period === "daily") {
      setSelectedDate((d) => addDays(d, 1));
    } else {
      setWeekStart((w) => addDays(w, 7));
    }
  }, [period]);

  const goToToday = useCallback(() => {
    setSelectedDate(new Date());
    setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));
  }, []);

  const stats = useMemo(
    () =>
      totals.reduce(
        (acc, t) => ({
          appointments: acc.appointments + t.appointments_count,
          revenue: acc.revenue + t.revenue,
          tips: acc.tips + t.tips,
          hours: acc.hours + t.hours_worked,
          commission: acc.commission + t.commission,
        }),
        { appointments: 0, revenue: 0, tips: 0, hours: 0, commission: 0 }
      ),
    [totals]
  );

  const periodLabel =
    period === "daily"
      ? format(selectedDate, "EEEE, MMM d, yyyy")
      : `${format(weekStart, "MMM d")} – ${format(endOfWeek(weekStart, { weekStartsOn: 1 }), "MMM d, yyyy")}`;

  if (error && !totals.length) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Team totals" onBack={() => router.back()} />
        <View style={twStyle("flex-1 justify-center px-4")}>
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader
        title="Team totals"
        subtitle="Daily & weekly performance"
        onBack={() => router.back()}
      />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: screenPadding, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Period tabs */}
        <View style={twStyle("flex-row rounded-xl bg-gray-100 p-1 mb-4")}>
          <TouchableOpacity
            onPress={() => setPeriod("daily")}
            style={[twStyle("flex-1 py-2.5 rounded-lg"), period === "daily" ? twStyle("bg-white shadow-sm") : undefined]}
          >
            <Text style={twStyle(`text-center font-medium ${period === "daily" ? "text-gray-900" : "text-gray-500"}`)}>
              Daily
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setPeriod("weekly")}
            style={[twStyle("flex-1 py-2.5 rounded-lg"), period === "weekly" ? twStyle("bg-white shadow-sm") : undefined]}
          >
            <Text style={twStyle(`text-center font-medium ${period === "weekly" ? "text-gray-900" : "text-gray-500"}`)}>
              Weekly
            </Text>
          </TouchableOpacity>
        </View>

        {/* Date nav */}
        <View style={twStyle("flex-row items-center justify-between mb-4")}>
          <View style={twStyle("flex-row items-center gap-2")}>
            <TouchableOpacity onPress={goPrev} style={twStyle("w-10 h-10 rounded-xl border border-gray-200 items-center justify-center")}>
              <Ionicons name="chevron-back" size={20} color="#374151" />
            </TouchableOpacity>
            <TouchableOpacity onPress={goToToday} style={twStyle("rounded-xl border border-gray-200 py-2 px-3")}>
              <Text style={twStyle("text-sm font-medium text-gray-700")}>Today</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={goNext} style={twStyle("w-10 h-10 rounded-xl border border-gray-200 items-center justify-center")}>
              <Ionicons name="chevron-forward" size={20} color="#374151" />
            </TouchableOpacity>
          </View>
          <Text style={twStyle("text-sm font-medium text-gray-600 flex-1 ml-2")} numberOfLines={1}>
            {periodLabel}
          </Text>
        </View>

        {/* Staff filter */}
        {staffList.length > 0 && (
          <View style={twStyle("mb-4")}>
            <Text style={twStyle("text-sm font-medium text-gray-700 mb-2")}>Staff</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <TouchableOpacity
                onPress={() => setSelectedMemberId("all")}
                style={[
                  twStyle("rounded-xl py-2 px-4 mr-2"),
                  (selectedMemberId === "all" || !selectedMemberId) ? twStyle("bg-gray-900") : twStyle("bg-gray-100"),
                ]}
              >
                <Text style={(selectedMemberId === "all" || !selectedMemberId) ? twStyle("text-white font-medium") : twStyle("text-gray-600")}>
                  All
                </Text>
              </TouchableOpacity>
              {staffList.map((s) => (
                <TouchableOpacity
                  key={s.id}
                  onPress={() => setSelectedMemberId(s.id)}
                  style={[
                    twStyle("rounded-xl py-2 px-4 mr-2"),
                    selectedMemberId === s.id ? twStyle("bg-gray-900") : twStyle("bg-gray-100"),
                  ]}
                >
                  <Text style={selectedMemberId === s.id ? twStyle("text-white font-medium") : twStyle("text-gray-600")} numberOfLines={1}>
                    {s.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {loading && !totals.length ? (
          <View style={twStyle("py-12 items-center")}>
            <LoadingState />
          </View>
        ) : totals.length === 0 ? (
          <View style={twStyle("rounded-2xl border border-gray-200 bg-white p-8 items-center")}>
            <Ionicons name="calendar-outline" size={48} color="#9ca3af" />
            <Text style={twStyle("mt-4 text-base font-medium text-gray-900")}>No data for this period</Text>
            <Text style={twStyle("mt-1 text-sm text-gray-500")}>Select a different date or week</Text>
          </View>
        ) : (
          <>
            {/* Stats row */}
            <View style={twStyle("flex-row flex-wrap gap-2 mb-4")}>
              <View style={twStyle("flex-1 min-w-[100px] rounded-xl border border-gray-200 bg-white p-3")}>
                <Text style={twStyle("text-xs text-gray-500")}>Appointments</Text>
                <Text style={twStyle("text-lg font-semibold text-gray-900")}>{stats.appointments}</Text>
              </View>
              <View style={twStyle("flex-1 min-w-[100px] rounded-xl border border-gray-200 bg-white p-3")}>
                <Text style={twStyle("text-xs text-gray-500")}>Revenue</Text>
                <Text style={twStyle("text-lg font-semibold text-gray-900")}>R{stats.revenue.toLocaleString()}</Text>
              </View>
              <View style={twStyle("flex-1 min-w-[100px] rounded-xl border border-gray-200 bg-white p-3")}>
                <Text style={twStyle("text-xs text-gray-500")}>Tips</Text>
                <Text style={twStyle("text-lg font-semibold text-gray-900")}>R{stats.tips.toLocaleString()}</Text>
              </View>
              <View style={twStyle("flex-1 min-w-[100px] rounded-xl border border-gray-200 bg-white p-3")}>
                <Text style={twStyle("text-xs text-gray-500")}>Hours</Text>
                <Text style={twStyle("text-lg font-semibold text-gray-900")}>{stats.hours.toFixed(1)}h</Text>
              </View>
              <View style={twStyle("flex-1 min-w-[100px] rounded-xl border border-gray-200 bg-white p-3")}>
                <Text style={twStyle("text-xs text-gray-500")}>Commission</Text>
                <Text style={twStyle("text-lg font-semibold text-gray-900")}>R{stats.commission.toLocaleString()}</Text>
              </View>
            </View>

            {/* Table */}
            <View style={twStyle("rounded-2xl border border-gray-200 bg-white overflow-hidden")}>
              <View style={twStyle("flex-row bg-gray-50 border-b border-gray-200 px-3 py-2")}>
                <Text style={twStyle("flex-1 text-xs font-semibold text-gray-600")}>Staff</Text>
                <Text style={twStyle("w-12 text-xs font-semibold text-gray-600 text-right")}>#</Text>
                <Text style={twStyle("w-16 text-xs font-semibold text-gray-600 text-right")}>Revenue</Text>
                <Text style={twStyle("w-12 text-xs font-semibold text-gray-600 text-right")}>Tips</Text>
                <Text style={twStyle("w-12 text-xs font-semibold text-gray-600 text-right")}>Hrs</Text>
                <Text style={twStyle("w-16 text-xs font-semibold text-gray-600 text-right")}>Commission</Text>
              </View>
              {totals.map((t) => (
                <View key={t.team_member_id} style={twStyle("flex-row border-b border-gray-100 px-3 py-3")}>
                  <Text style={twStyle("flex-1 text-sm font-medium text-gray-900")} numberOfLines={1}>
                    {t.team_member_name}
                  </Text>
                  <Text style={twStyle("w-12 text-sm text-gray-700 text-right")}>{t.appointments_count}</Text>
                  <Text style={twStyle("w-16 text-sm text-gray-700 text-right")}>R{t.revenue.toLocaleString()}</Text>
                  <Text style={twStyle("w-12 text-sm text-gray-700 text-right")}>R{t.tips.toLocaleString()}</Text>
                  <Text style={twStyle("w-12 text-sm text-gray-700 text-right")}>{t.hours_worked.toFixed(1)}</Text>
                  <Text style={twStyle("w-16 text-sm font-medium text-gray-700 text-right")}>
                    R{t.commission.toLocaleString()}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
