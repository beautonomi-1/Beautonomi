/**
 * End of day: recorded takings by payment method (cash-register style).
 */
import { useCallback, useMemo } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "@beautonomi/i18n";
import { formatInTimeZone } from "date-fns-tz";
import { Ionicons } from "@expo/vector-icons";
import { ReportPayloadView } from "@/features/reports/ReportPayloadView";
import { formatCurrency } from "@/lib/format";
import { twStyle } from "@/lib/twStyle";
import { useApi } from "@/hooks/useApi";
import { useProvider } from "@/providers/ProviderContext";
import { DirectionalIcon } from "@/components/ui/DirectionalIcon";
const METHOD_KEYS: Record<string, string> = {
  cash: "methodCash",
  card: "methodCard",
  bank_transfer: "methodBankTransfer",
  paystack: "methodPaystack",
  yoco: "methodYoco",
  paycloud: "methodPaycloud",
  gift_card: "methodGiftCard",
  wallet: "methodWallet",
  other: "methodOther",
  cashback: "methodCashback",
};

type CloseOutBookingRow = {
  id: string;
  booking_number?: string | null;
  scheduled_at: string;
  status: string;
  location_type?: string | null;
  suggested_close_out_action?: string | null;
  customer?: { full_name?: string | null } | null;
  booking_services?: Array<{ offerings?: { title?: string } | null }> | null;
};

type CloseOutPayload = {
  summary?: { today?: number; older?: number; total?: number };
  bookings?: CloseOutBookingRow[];
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

function closeOutActionLabel(action: string | null | undefined, eod: (key: string) => string): string {
  if (action === "complete") return eod("actionComplete");
  if (action === "provider_cancel") return eod("actionCancel");
  return eod("actionReview");
}

function formatCloseOutTime(iso: string, timezone?: string): string {
  try {
    return formatInTimeZone(new Date(iso), timezone || "Africa/Johannesburg", "HH:mm");
  } catch {
    return "—";
  }
}

export function EndOfDayReportView({ data }: { data: unknown }) {
  const { t } = useTranslation();
  const eod = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t("provider.mobile.screens.endOfDayReport." + key, opts) as string,
    [t],
  );
  const router = useRouter();
  const { provider, selectedLocationId } = useProvider();

  const reportDate = isEndOfDayPayload(data) && typeof data.date === "string" ? data.date.slice(0, 10) : "";
  const reportTimezone =
    isEndOfDayPayload(data) && typeof data.timezone === "string" ? data.timezone : provider?.timezone ?? undefined;

  const closeOutUrl = useMemo(
    () =>
      selectedLocationId
        ? `/api/provider/bookings/close-out?location_id=${encodeURIComponent(selectedLocationId)}`
        : "/api/provider/bookings/close-out",
    [selectedLocationId],
  );

  const { data: closeOutRaw } = useApi<CloseOutPayload>(closeOutUrl, {
    staleTimeMs: 30_000,
    enabled: Boolean(reportDate),
  });

  const unclosedForReportDay = useMemo(() => {
    const rows = Array.isArray(closeOutRaw?.bookings) ? closeOutRaw!.bookings! : [];
    if (!reportDate) return rows;
    const tz = reportTimezone || "Africa/Johannesburg";
    return rows.filter((row) => {
      try {
        const ymd = formatInTimeZone(new Date(row.scheduled_at), tz, "yyyy-MM-dd");
        return ymd === reportDate;
      } catch {
        return false;
      }
    });
  }, [closeOutRaw?.bookings, reportDate, reportTimezone]);

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

  const closeOutSummary = closeOutRaw?.summary;
  const totalUnclosed = closeOutSummary?.total ?? unclosedForReportDay.length;

  return (
    <View style={twStyle("gap-5 pb-8")}>
      <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>
        {eod("factsDefinitions")}
      </Text>
      {basis ? (
        <View style={twStyle("rounded-2xl border border-sky-100 bg-sky-50/95 px-4 py-3")}>
          <Text style={twStyle("text-sm leading-5 text-sky-950")}>{basis}</Text>
          {(date || tz) && (
            <Text style={twStyle("mt-2 text-xs text-sky-900/85")}>
              {date && tz ? eod("dayAndTz", { date, tz }) : date ? eod("dayOnly", { date }) : tz}
            </Text>
          )}
        </View>
      ) : null}

      {(totalUnclosed > 0 || unclosedForReportDay.length > 0) ? (
        <View style={twStyle("rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-4")}>
          <View style={twStyle("mb-2 flex-row items-center gap-2")}>
            <Ionicons name="alert-circle-outline" size={18} color="#b45309" />
            <Text style={twStyle("text-sm font-semibold text-amber-950")}>{eod("unclosedTitle")}</Text>
          </View>
          <Text style={twStyle("text-xs leading-5 text-amber-900")}>
            {unclosedForReportDay.length > 0
              ? eod("unclosedOnDay", { count: unclosedForReportDay.length, date: reportDate || eod("thisDay") })
              : eod("unclosedAcross", { count: totalUnclosed })}
          </Text>
          {unclosedForReportDay.length > 0 ? (
            <View style={twStyle("mt-3 rounded-xl border border-amber-100 bg-white")}>
              {unclosedForReportDay.slice(0, 8).map((row) => {
                const name = row.customer?.full_name ?? eod("guestFallback");
                const service =
                  row.booking_services?.[0]?.offerings?.title ??
                  (row.location_type === "at_home" ? eod("houseCall") : eod("appointmentFallback"));
                return (
                  <TouchableOpacity
                    key={row.id}
                    onPress={() => router.push(`/(app)/(tabs)/more/bookings/${row.id}` as never)}
                    style={twStyle("flex-row items-center border-b border-amber-50 px-3 py-3 last:border-b-0")}
                    accessibilityRole="button"
                    accessibilityLabel={eod("openUnclosedA11y", { name })}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={twStyle("text-sm font-medium text-gray-900")} numberOfLines={1}>
                        {name}
                      </Text>
                      <Text style={twStyle("text-xs text-gray-500")} numberOfLines={1}>
                        {formatCloseOutTime(row.scheduled_at, reportTimezone)} · {service} ·{" "}
                        {row.status.replace(/_/g, " ")}
                      </Text>
                    </View>
                    <Text style={twStyle("ms-2 text-[11px] font-semibold text-amber-800")}>
                      {closeOutActionLabel(row.suggested_close_out_action, eod)}
                    </Text>
                    <DirectionalIcon name="chevron-forward" size={16} color="#9ca3af" style={{ marginStart: 4 }} />
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}
          <TouchableOpacity
            onPress={() =>
              router.push({
                pathname: "/(app)/(tabs)/more/bookings",
                params: { status: "close_out" },
              } as never)
            }
            style={twStyle("mt-3 self-start rounded-full bg-amber-100 px-3 py-1.5")}
            accessibilityRole="button"
            accessibilityLabel={eod("viewQueueA11y")}
          >
            <Text style={twStyle("text-xs font-semibold text-amber-900")}>{eod("viewQueue")}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={twStyle("rounded-2xl border border-emerald-100 bg-emerald-50/90 px-4 py-4")}>
        <Text style={twStyle("text-xs font-medium text-emerald-900")}>{eod("totalTakings")}</Text>
        <Text style={twStyle("mt-1 text-2xl font-semibold tabular-nums text-emerald-950")}>
          {formatCurrency(total)}
        </Text>
      </View>

      <View style={twStyle("flex-row flex-wrap gap-3")}>
        <View style={twStyle("min-w-[140px] flex-1 rounded-2xl border border-gray-100 bg-white px-4 py-3")}>
          <Text style={twStyle("text-xs text-gray-600")}>{eod("bookingPayments")}</Text>
          <Text style={twStyle("mt-1 text-lg font-semibold tabular-nums text-gray-900")}>
            {formatCurrency(Number((data as { bookingPaymentsTotal?: number }).bookingPaymentsTotal ?? 0))}
          </Text>
        </View>
        <View style={twStyle("min-w-[140px] flex-1 rounded-2xl border border-gray-100 bg-white px-4 py-3")}>
          <Text style={twStyle("text-xs text-gray-600")}>{eod("walletSplitSafe")}</Text>
          <Text style={twStyle("mt-1 text-lg font-semibold tabular-nums text-gray-900")}>
            {formatCurrency(Number((data as { walletTotal?: number }).walletTotal ?? 0))}
          </Text>
        </View>
        <View style={twStyle("min-w-[140px] flex-1 rounded-2xl border border-gray-100 bg-white px-4 py-3")}>
          <Text style={twStyle("text-xs text-gray-600")}>{eod("retailLegacy")}</Text>
          <Text style={twStyle("mt-1 text-lg font-semibold tabular-nums text-gray-900")}>
            {formatCurrency(Number((data as { salesTotal?: number }).salesTotal ?? 0))}
          </Text>
        </View>
      </View>

      <View style={twStyle("flex-row flex-wrap gap-3")}>
        <View style={twStyle("min-w-[140px] flex-1 rounded-2xl border border-amber-50 bg-amber-50/80 px-4 py-3")}>
          <Text style={twStyle("text-xs text-amber-900")}>{eod("tipsLedger")}</Text>
          <Text style={twStyle("mt-1 text-lg font-semibold tabular-nums text-amber-950")}>
            {formatCurrency(Number((data as { tipsTotal?: number }).tipsTotal ?? 0))}
          </Text>
        </View>
        <View style={twStyle("min-w-[140px] flex-1 rounded-2xl border border-orange-50 bg-orange-50/80 px-4 py-3")}>
          <Text style={twStyle("text-xs text-orange-900")}>{eod("cancellationFeesKept")}</Text>
          <Text style={twStyle("mt-1 text-lg font-semibold tabular-nums text-orange-950")}>
            {formatCurrency(Number((data as { cancellationFeesTotal?: number }).cancellationFeesTotal ?? 0))}
          </Text>
        </View>
      </View>

      {Number((data as { cashbackTotal?: number }).cashbackTotal ?? 0) > 0 ? (
        <View style={twStyle("rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3")}>
          <Text style={twStyle("text-xs text-slate-700")}>
            {eod("cashbackNote")}
          </Text>
          <Text style={twStyle("mt-1 text-lg font-semibold tabular-nums text-slate-950")}>
            {formatCurrency(Number((data as { cashbackTotal?: number }).cashbackTotal ?? 0))}
          </Text>
        </View>
      ) : null}

      {methods.length > 0 ? (
        <View>
          <Text style={twStyle("mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500")}>
            {eod("byPaymentMethod")}
          </Text>
          <View style={twStyle("rounded-2xl border border-gray-100 bg-white")}>
            {methods.map((m) => (
              <View
                key={m.key}
                style={twStyle("flex-row justify-between border-b border-gray-50 px-4 py-3 last:border-b-0")}
              >
                <Text style={twStyle("text-sm text-gray-900")}>{METHOD_KEYS[m.key] ? eod(METHOD_KEYS[m.key]) : m.key}</Text>
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

      {Object.keys(detailPayload).length > 0 ? <ReportPayloadView data={detailPayload} title={eod("details")} /> : null}
    </View>
  );
}
