/**
 * Native VAT Reports – bi-monthly VAT reports for SARS submission.
 * Full parity with web: list by period, year picker, mark remitted, export/share.
 */
import { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Share,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { ActionButton } from "@/components/ui/ActionButton";
import { twStyle } from "@/lib/twStyle";
import { formatCurrency } from "@/lib/format";
import { getTenantLocaleTag } from "@/lib/locale";

interface VATTransaction {
  id: string;
  amount: number;
  booking_number: string;
  booking_date: string;
  description: string;
}

interface VATReport {
  period_start: string;
  period_end: string;
  deadline_date: string;
  period_label: string;
  vat_collected: number;
  vat_collected_formatted: string;
  transaction_count: number;
  transactions: VATTransaction[];
  reminder_sent: { sent_at: string; days_before_deadline: number } | null;
  days_until_deadline: number;
  is_overdue: boolean;
  status: "overdue" | "due_soon" | "upcoming" | "remitted";
  remitted_to_sars: boolean;
  remitted_at: string | null;
  reminder_id: string | null;
}

interface VATReportsData {
  reports: VATReport[];
  provider: { vat_number: string | null; is_vat_registered: boolean };
  year: number;
}

function formatDateSafe(
  value: unknown,
  locales: string | string[] = "en-ZA",
  options?: Intl.DateTimeFormatOptions,
): string {
  if (typeof value !== "string" || !value) return "—";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "—";
  return parsed.toLocaleDateString(locales, options);
}

const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = [currentYear, currentYear - 1, currentYear - 2];

export default function VATReportsScreen() {
  const router = useRouter();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const { data, loading, error, refresh } = useApi<VATReportsData>(
    `/api/provider/finance/vat-reports?year=${selectedYear}`
  );
  const { execute: patchRemitted, loading: markingRemitted } = useApiMutation<unknown>("patch");

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const markAsRemitted = useCallback(
    async (report: VATReport) => {
      if (!report.reminder_id) {
        Alert.alert("Error", "Unable to mark as remitted. Please refresh.");
        return;
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const { error: err } = await patchRemitted(
        `/api/provider/finance/vat-reports/${report.reminder_id}/mark-remitted`,
        { period_start: report.period_start, period_end: report.period_end }
      );
      if (err) {
        Alert.alert("Error", err);
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refresh();
    },
    [patchRemitted, refresh]
  );

  const confirmMarkAsRemitted = useCallback(
    (report: VATReport) => {
      Alert.alert(
        "Mark as remitted?",
        `Confirm you submitted ${report.period_label} VAT to SARS. This updates your records only.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Mark remitted", onPress: () => void markAsRemitted(report) },
        ]
      );
    },
    [markAsRemitted]
  );

  const exportReport = useCallback(
    (report: VATReport) => {
      const rows = [
        ["VAT Remittance Report", ""],
        ["Period", report.period_label],
        ["Period Start", report.period_start],
        ["Period End", report.period_end],
        ["Deadline", report.deadline_date],
        ["VAT Collected", report.vat_collected_formatted],
        ["Transaction Count", report.transaction_count.toString()],
        [""],
        ["Booking Number", "Date", "VAT Amount", "Description"],
        ...report.transactions.map((t) => [
          t.booking_number,
          formatDateSafe(t.booking_date, getTenantLocaleTag()),
          formatCurrency(t.amount),
          t.description || "",
        ]),
      ];
      const csv = rows.map((r) => r.join(",")).join("\n");
      const filename = `vat-report-${report.period_start}-${report.period_end}.csv`;
      Share.share({
        message: csv,
        title: filename,
        ...(Platform.OS === "ios" && { url: undefined }),
      }).catch(() => {});
    },
    []
  );

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="VAT Reports" onBack={() => router.back()} />
        <View style={twStyle("flex-1 items-center justify-center py-12")}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="VAT Reports" onBack={() => router.back()} />
        <View style={twStyle("flex-1 justify-center px-4")}>
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  const payload = data as VATReportsData;
  if (!payload.provider?.is_vat_registered) {
    return (
      <ScreenContainer>
        <ScreenHeader title="VAT Reports" onBack={() => router.back()} />
        <View style={twStyle("flex-1 px-4 pt-4")}>
          <View style={twStyle("rounded-2xl border border-gray-200 bg-white p-6 items-center")}>
            <Ionicons name="alert-circle-outline" size={48} color="#9ca3af" />
            <Text style={twStyle("mt-4 text-lg font-semibold text-gray-900 text-center")}>
              VAT Reports Not Available
            </Text>
            <Text style={twStyle("mt-2 text-sm text-gray-600 text-center")}>
              You are not VAT registered. VAT reports are only available for VAT-registered providers.
            </Text>
            <TouchableOpacity
              onPress={() => router.push("/(app)/(tabs)/more/settings/tax-configuration" as never)}
              style={twStyle("mt-6 rounded-xl bg-primary py-3 px-5")}
            >
              <Text style={twStyle("font-medium text-white")}>Update VAT status in Settings</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScreenContainer>
    );
  }

  const reports = payload.reports ?? [];

  return (
    <ScreenContainer>
      <ScreenHeader
        title="VAT Reports"
        subtitle={payload.provider?.vat_number ? `VAT No. ${payload.provider.vat_number}` : "Bi-monthly SARS submission"}
        onBack={() => router.back()}
      />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={twStyle("pb-24 px-4")}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Year picker */}
        <View style={twStyle("flex-row items-center justify-between mb-4")}>
          <Text style={twStyle("text-sm font-medium text-gray-700")}>Year</Text>
          <View style={twStyle("flex-row rounded-2xl border border-gray-200 bg-gray-50 overflow-hidden")}>
            {YEAR_OPTIONS.map((y, i) => (
              <TouchableOpacity
                key={y}
                onPress={() => setSelectedYear(y)}
                style={[
                  twStyle("flex-1 py-2.5 px-4 items-center justify-center"),
                  i === 0 && twStyle("rounded-l-2xl"),
                  i === YEAR_OPTIONS.length - 1 && twStyle("rounded-r-2xl"),
                  selectedYear === y ? twStyle("bg-gray-900") : twStyle("bg-transparent"),
                ]}
              >
                <Text style={twStyle(selectedYear === y ? "text-white font-semibold" : "text-gray-600")}>{y}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {reports.length === 0 ? (
          <View style={twStyle("rounded-2xl border border-gray-200 bg-white p-8 items-center")}>
            <Ionicons name="document-text-outline" size={48} color="#9ca3af" />
            <Text style={twStyle("mt-4 text-base font-semibold text-gray-900 text-center")}>
              No VAT Reports for {selectedYear}
            </Text>
            <Text style={twStyle("mt-2 text-sm text-gray-500 text-center")}>
              Reports will appear here once you have bookings with VAT collected.
            </Text>
          </View>
        ) : (
          reports.map((report, index) => {
            const isExpanded = expandedIndex === index;
            const statusBg =
              report.remitted_to_sars
                ? "bg-green-100"
                : report.is_overdue
                  ? "bg-red-100"
                  : report.status === "due_soon"
                    ? "bg-amber-100"
                    : "bg-gray-100";
            const statusColor =
              report.remitted_to_sars
                ? "text-green-800"
                : report.is_overdue
                  ? "text-red-800"
                  : report.status === "due_soon"
                    ? "text-amber-800"
                    : "text-gray-700";
            const borderAccent = report.is_overdue && !report.remitted_to_sars
              ? "border-red-300 bg-red-50/50"
              : report.status === "due_soon" && !report.remitted_to_sars
                ? "border-amber-300 bg-amber-50/50"
                : "border-gray-200 bg-white";

            return (
              <View
                key={`${report.period_start}-${report.period_end}`}
                style={[twStyle("rounded-2xl border p-4 mb-4"), twStyle(borderAccent)]}
              >
                <View style={twStyle("flex-row items-start justify-between mb-2")}>
                  <View style={{ flex: 1 }}>
                    <View style={twStyle("flex-row items-center gap-2 flex-wrap")}>
                      <Text style={twStyle("text-lg font-semibold text-gray-900")}>{report.period_label}</Text>
                      <View style={[twStyle("rounded-full px-2.5 py-0.5"), twStyle(statusBg)]}>
                        <Text style={[twStyle("text-xs font-medium"), twStyle(statusColor)]}>
                          {report.remitted_to_sars ? "Remitted" : report.is_overdue ? "Overdue" : report.status === "due_soon" ? "Due soon" : "Upcoming"}
                        </Text>
                      </View>
                    </View>
                    <Text style={twStyle("text-sm text-gray-500 mt-1")}>
                      Deadline: {formatDateSafe(report.deadline_date, getTenantLocaleTag(), {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                      {report.days_until_deadline > 0 && !report.remitted_to_sars && (
                        <Text style={twStyle("text-gray-600")}> · {report.days_until_deadline} days left</Text>
                      )}
                    </Text>
                  </View>
                  <View style={twStyle("items-end")}>
                    <Text style={twStyle("text-xl font-bold text-primary")}>{report.vat_collected_formatted}</Text>
                    <Text style={twStyle("text-xs text-gray-500")}>
                      {report.transaction_count} transaction{report.transaction_count !== 1 ? "s" : ""}
                    </Text>
                  </View>
                </View>

                {report.transactions.length > 0 && (
                  <>
                    <TouchableOpacity
                      onPress={() => setExpandedIndex(isExpanded ? null : index)}
                      style={twStyle("flex-row items-center justify-between py-2 mt-2 border-t border-gray-100")}
                    >
                      <Text style={twStyle("text-sm font-medium text-gray-700")}>Transaction details</Text>
                      <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={18} color="#6b7280" />
                    </TouchableOpacity>
                    {isExpanded && (
                      <View style={twStyle("mt-2 border-t border-gray-100 pt-2")}>
                        {report.transactions.slice(0, 20).map((t) => (
                          <View key={t.id} style={twStyle("flex-row justify-between py-1.5")}>
                            <Text style={twStyle("text-sm text-gray-600")} numberOfLines={1}>
                              {t.booking_number} · {formatDateSafe(t.booking_date, getTenantLocaleTag())}
                            </Text>
                            <Text style={twStyle("text-sm font-medium text-gray-900")}>R{t.amount.toFixed(2)}</Text>
                          </View>
                        ))}
                        {report.transactions.length > 20 && (
                          <Text style={twStyle("text-xs text-gray-500 mt-1")}>
                            +{report.transactions.length - 20} more
                          </Text>
                        )}
                        <TouchableOpacity
                          onPress={() => exportReport(report)}
                          style={twStyle("flex-row items-center mt-3 text-primary")}
                        >
                          <Ionicons name="share-outline" size={16} color="#6366f1" />
                          <Text style={twStyle("text-sm font-medium text-primary ml-1")}>Export / Share CSV</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </>
                )}

                <View style={twStyle("mt-4 pt-4 border-t border-gray-100")}>
                  {report.remitted_to_sars ? (
                    <View style={twStyle("flex-row items-center rounded-xl bg-green-50 border border-green-200 p-3")}>
                      <Ionicons name="checkmark-circle" size={22} color="#16a34a" />
                      <Text style={twStyle("ml-2 text-sm text-green-800")}>
                        Remitted to SARS
                        {report.remitted_at && (
                          <Text style={twStyle("text-green-700")}>
                            {" "}· {formatDateSafe(report.remitted_at, getTenantLocaleTag())}
                          </Text>
                        )}
                      </Text>
                    </View>
                  ) : (
                    <View style={twStyle("rounded-xl bg-blue-50 border border-blue-200 p-3")}>
                      <Text style={twStyle("text-sm text-blue-800 mb-3")}>
                        Remit {report.vat_collected_formatted} to SARS by the deadline. Submit via SARS eFiling.
                      </Text>
                      <ActionButton
                        label={markingRemitted ? "Saving…" : "Mark as remitted to SARS"}
                        onPress={() => confirmMarkAsRemitted(report)}
                        loading={markingRemitted}
                        fullWidth
                      />
                    </View>
                  )}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
