/**
 * Native VAT Reports – bi-monthly VAT reports for SARS submission.
 * Full parity with web: list by period, year picker, mark remitted, export/share.
 */
import { useCallback, useState, type ReactNode } from "react";
import { useTranslation } from "@beautonomi/i18n";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  Share,
  Platform,
  ScrollView,
  RefreshControl,
} from "react-native";
import { useRouter, Redirect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi, useApiMutation, MONEY_SURFACE_TIMEOUT_MS } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { ActionButton } from "@/components/ui/ActionButton";
import { twStyle } from "@/lib/twStyle";
import { formatCurrency } from "@/lib/format";
import { getTenantLocaleTag } from "@/lib/locale";
import { useResponsive } from "@/hooks/useResponsive";

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
  empty = "—",
): string {
  if (typeof value !== "string" || !value) return empty;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return empty;
  return parsed.toLocaleDateString(locales, options);
}

const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = [currentYear, currentYear - 1, currentYear - 2];

function VatReportsShell({
  embedded,
  screenPadding,
  scrollable = false,
  refreshing,
  onRefresh,
  centerContent = false,
  children,
}: {
  embedded: boolean;
  screenPadding: number;
  scrollable?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  centerContent?: boolean;
  children: ReactNode;
}) {
  if (embedded) {
    if (scrollable) {
      return (
        <ScrollView
          style={{ flex: 1, minHeight: 0 }}
          contentContainerStyle={{ paddingHorizontal: screenPadding, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            onRefresh ? (
              <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      );
    }
    return (
      <View
        style={{
          flex: 1,
          minHeight: 0,
          paddingHorizontal: screenPadding,
          ...(centerContent ? { justifyContent: "center" } : {}),
        }}
      >
        {children}
      </View>
    );
  }
  if (scrollable) {
    return (
      <ScreenContainer refreshing={refreshing} onRefresh={onRefresh}>
        {children}
      </ScreenContainer>
    );
  }
  return <ScreenContainer scrollable={false}>{children}</ScreenContainer>;
}

export function VATReportsContent({ embedded = false }: { embedded?: boolean } = {}) {
  const { t } = useTranslation();
  const vr = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.screens.vatReports.${key}`, opts) as string,
    [t],
  );
  const router = useRouter();
  const { screenPadding } = useResponsive();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const { data, loading, error, refresh } = useApi<VATReportsData>(
    `/api/provider/finance/vat-reports?year=${selectedYear}`,
    { timeoutMs: MONEY_SURFACE_TIMEOUT_MS },
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
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      // When no reminder has been sent yet, pass "new" — the API will create
      // the reminder record on the first mark-as-remitted call.
      const reminderId = report.reminder_id ?? "new";
      const { error: err } = await patchRemitted(
        `/api/provider/finance/vat-reports/${reminderId}/mark-remitted`,
        { period_start: report.period_start, period_end: report.period_end }
      );
      if (err) {
        Alert.alert(vr("errorTitle"), err);
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refresh();
    },
    [patchRemitted, refresh, vr]
  );

  const confirmMarkAsRemitted = useCallback(
    (report: VATReport) => {
      Alert.alert(
        vr("markRemittedTitle"),
        vr("markRemittedBody", { period: report.period_label }),
        [
          { text: vr("cancel"), style: "cancel" },
          { text: vr("markRemitted"), onPress: () => void markAsRemitted(report) },
        ]
      );
    },
    [markAsRemitted, vr]
  );

  const exportReport = useCallback(
    (report: VATReport) => {
      const quote = (v: string | number) => {
        const s = String(v ?? "");
        return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const empty = vr("emptyValue");
      const rows = [
        [vr("csvTitle"), ""],
        [vr("csvPeriod"), report.period_label],
        [vr("csvPeriodStart"), report.period_start],
        [vr("csvPeriodEnd"), report.period_end],
        [vr("csvDeadline"), report.deadline_date],
        [vr("csvVatCollected"), report.vat_collected_formatted],
        [vr("csvTransactionCount"), report.transaction_count.toString()],
        [""],
        [vr("csvBookingNumber"), vr("csvDate"), vr("csvVatAmount"), vr("csvDescription")],
        ...report.transactions.map((txn) => [
          txn.booking_number,
          formatDateSafe(txn.booking_date, getTenantLocaleTag(), undefined, empty),
          formatCurrency(txn.amount),
          txn.description || "",
        ]),
      ];
      const csv = rows.map((r) => r.map(quote).join(",")).join("\n");
      const filename = `vat-report-${report.period_start}-${report.period_end}.csv`;
      Share.share({
        message: csv,
        title: filename,
        ...(Platform.OS === "ios" && { url: undefined }),
      }).catch(() => {});
    },
    [vr]
  );

  if (loading && !data) {
    return (
      <VatReportsShell embedded={embedded} screenPadding={screenPadding} centerContent>
        {!embedded ? <ScreenHeader title={vr("title")} onBack={() => router.back()} /> : null}
        <View style={twStyle("flex-1 items-center justify-center py-12")}>
          <LoadingState />
        </View>
      </VatReportsShell>
    );
  }

  if (error && !data) {
    return (
      <VatReportsShell embedded={embedded} screenPadding={screenPadding} centerContent>
        {!embedded ? <ScreenHeader title={vr("title")} onBack={() => router.back()} /> : null}
        <View style={twStyle("flex-1 justify-center px-4")}>
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </VatReportsShell>
    );
  }

  const payload = data as VATReportsData;
  if (!payload.provider?.is_vat_registered) {
    return (
      <VatReportsShell embedded={embedded} screenPadding={screenPadding} scrollable>
        {!embedded ? <ScreenHeader title={vr("title")} onBack={() => router.back()} /> : null}
        <View style={twStyle("flex-1 px-4 pt-4")}>
          <View style={twStyle("rounded-2xl border border-gray-200 bg-white p-6 items-center")}>
            <Ionicons name="alert-circle-outline" size={48} color="#9ca3af" />
            <Text style={twStyle("mt-4 text-lg font-semibold text-gray-900 text-center")}>
              {vr("notAvailableTitle")}
            </Text>
            <Text style={twStyle("mt-2 text-sm text-gray-600 text-center")}>
              {vr("notAvailableBody")}
            </Text>
            <TouchableOpacity
              onPress={() => router.push("/(app)/(tabs)/more/settings/tax-configuration" as never)}
              style={twStyle("mt-6 rounded-xl bg-primary py-3 px-5")}
            >
              <Text style={twStyle("font-medium text-white")}>{vr("updateVatStatus")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </VatReportsShell>
    );
  }

  const reports = payload.reports ?? [];

  return (
    <VatReportsShell
      embedded={embedded}
      screenPadding={screenPadding}
      scrollable
      refreshing={refreshing}
      onRefresh={onRefresh}
    >
      {!embedded ? (
        <ScreenHeader
          title={vr("title")}
          subtitle={payload.provider?.vat_number ? vr("vatNumber", { number: payload.provider.vat_number }) : vr("subtitle")}
          onBack={() => router.back()}
        />
      ) : null}
      <View style={twStyle("mb-4")}>
        <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>{vr("year")}</Text>
        <View style={twStyle("flex-row rounded-2xl border border-gray-200 bg-gray-50 overflow-hidden")}>
          {YEAR_OPTIONS.map((y, i) => (
            <TouchableOpacity
              key={y}
              onPress={() => setSelectedYear(y)}
              style={[
                twStyle("flex-1 py-3 min-h-[48px] items-center justify-center"),
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
              {vr("noReportsTitle", { year: selectedYear })}
            </Text>
            <Text style={twStyle("mt-2 text-sm text-gray-500 text-center")}>
              {vr("noReportsBody")}
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
                <View style={twStyle("mb-2 flex-row items-start justify-between")}>
                  <View style={twStyle("min-w-0 flex-1 pe-3")}>
                    <View style={twStyle("flex-row flex-wrap items-center")}>
                      <Text style={twStyle("text-lg font-semibold text-gray-900")}>{report.period_label}</Text>
                      <View style={[twStyle("ms-2 rounded-full px-2.5 py-0.5"), twStyle(statusBg)]}>
                        <Text style={[twStyle("text-xs font-medium"), twStyle(statusColor)]}>
                          {report.remitted_to_sars ? vr("statusRemitted") : report.is_overdue ? vr("statusOverdue") : report.status === "due_soon" ? vr("statusDueSoon") : vr("statusUpcoming")}
                        </Text>
                      </View>
                    </View>
                    <Text style={twStyle("text-sm text-gray-500 mt-1")}>
                      {vr("deadline", {
                        date: formatDateSafe(report.deadline_date, getTenantLocaleTag(), {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        }, vr("emptyValue")),
                      })}
                      {report.days_until_deadline > 0 && !report.remitted_to_sars && (
                        <Text style={twStyle("text-gray-600")}>{vr("daysLeft", { count: report.days_until_deadline })}</Text>
                      )}
                    </Text>
                  </View>
                  <View style={twStyle("max-w-[42%] shrink-0 items-end")}>
                    <Text style={twStyle("text-right text-xl font-bold text-primary")} numberOfLines={2}>
                      {report.vat_collected_formatted}
                    </Text>
                    <Text style={twStyle("text-xs text-gray-500")}>
                      {vr("transactionCount", { count: report.transaction_count })}
                    </Text>
                  </View>
                </View>

                {report.transactions.length > 0 && (
                  <>
                    <TouchableOpacity
                      onPress={() => setExpandedIndex(isExpanded ? null : index)}
                      style={twStyle("flex-row items-center justify-between py-2 mt-2 border-t border-gray-100")}
                    >
                      <Text style={twStyle("text-sm font-medium text-gray-700")}>{vr("transactionDetails")}</Text>
                      <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={18} color="#6b7280" />
                    </TouchableOpacity>
                    {isExpanded && (
                      <View style={twStyle("mt-2 border-t border-gray-100 pt-2")}>
                        {report.transactions.slice(0, 20).map((txn) => (
                          <View
                            key={txn.id}
                            style={twStyle("flex-row items-start justify-between border-b border-gray-100 py-2.5")}
                          >
                            <View style={twStyle("min-w-0 flex-1 pe-3")}>
                              <Text style={twStyle("text-sm font-medium text-gray-900")} numberOfLines={1}>
                                {txn.booking_number}
                              </Text>
                              <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>
                                {formatDateSafe(txn.booking_date, getTenantLocaleTag(), undefined, vr("emptyValue"))}
                              </Text>
                              {txn.description ? (
                                <Text style={twStyle("mt-0.5 text-xs text-gray-400")} numberOfLines={2}>
                                  {txn.description}
                                </Text>
                              ) : null}
                            </View>
                            <Text style={twStyle("shrink-0 text-sm font-semibold text-gray-900")}>
                              {formatCurrency(txn.amount)}
                            </Text>
                          </View>
                        ))}
                        {report.transactions.length > 20 && (
                          <Text style={twStyle("text-xs text-gray-500 mt-1")}>
                            {vr("moreCount", { count: report.transactions.length - 20 })}
                          </Text>
                        )}
                        <TouchableOpacity
                          onPress={() => exportReport(report)}
                          style={twStyle("flex-row items-center mt-3 text-primary")}
                        >
                          <Ionicons name="share-outline" size={16} color="#6366f1" />
                          <Text style={twStyle("text-sm font-medium text-primary ms-1")}>{vr("exportShareCsv")}</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </>
                )}

                <View style={twStyle("mt-4 pt-4 border-t border-gray-100")}>
                  {report.remitted_to_sars ? (
                    <View style={twStyle("flex-row items-center rounded-xl bg-green-50 border border-green-200 p-3")}>
                      <Ionicons name="checkmark-circle" size={22} color="#16a34a" />
                      <Text style={twStyle("ms-2 text-sm text-green-800")}>
                        {vr("remittedToSars")}
                        {report.remitted_at && (
                          <Text style={twStyle("text-green-700")}>
                            {vr("remittedOn", { date: formatDateSafe(report.remitted_at, getTenantLocaleTag(), undefined, vr("emptyValue")) })}
                          </Text>
                        )}
                      </Text>
                    </View>
                  ) : (
                    <View style={twStyle("rounded-xl bg-blue-50 border border-blue-200 p-3")}>
                      <Text style={twStyle("text-sm text-blue-800 mb-3")}>
                        {vr("remitHint", { amount: report.vat_collected_formatted })}
                      </Text>
                      <ActionButton
                        label={markingRemitted ? vr("saving") : vr("markRemittedCta")}
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
    </VatReportsShell>
  );
}

export default function VATReportsScreen() {
  return <Redirect href="/(app)/(tabs)/more/billing?tab=vat" />;
}
