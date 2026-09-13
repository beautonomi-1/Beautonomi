/**
 * Performance dashboard: ledger headline revenue + scheduled booking counts + preview lists.
 */
import { useCallback } from "react";
import { View, Text } from "react-native";
import { format } from "date-fns";
import { useTranslation } from "@beautonomi/i18n";
import { ReportPayloadView } from "@/features/reports/ReportPayloadView";
import { formatCurrency, formatStatusLabel } from "@/lib/format";
import { twStyle } from "@/lib/twStyle";

type LedgerBlock = {
  revenue?: number;
  ledgerFromBookings?: number;
  ledgerFromProductOrders?: number;
  bookings?: number;
  completed?: number;
  clients?: number;
};

function isDashboardPayload(data: unknown): data is {
  timezone?: string;
  windows?: {
    today?: { fromYmd?: string; toYmd?: string };
    week?: { fromYmd?: string; toYmd?: string };
    month?: { fromYmd?: string; toYmd?: string };
  };
  reportBasis?: string;
  basis?: Record<string, string>;
  today?: LedgerBlock;
  week?: LedgerBlock;
  month?: LedgerBlock;
  upcomingBookings?: {
    id?: string;
    scheduled_at?: string;
    status?: string;
    total_amount?: number | null;
  }[];
  recentBookings?: {
    id?: string;
    scheduled_at?: string;
    status?: string;
    total_amount?: number | null;
  }[];
} {
  return data != null && typeof data === "object" && !Array.isArray(data) && "today" in data;
}

const BASIS_KEYS: Record<string, string> = {
  ledgerHeadline: "basisLedger",
  bookingCounts: "basisBookings",
  todayWindow: "basisToday",
  weekWindow: "basisWeek",
  monthWindow: "basisMonth",
  upcomingList: "basisUpcoming",
  recentList: "basisRecent",
  bookedAmountColumn: "basisBookedColumn",
};

function SplitNote({ lb, lo, label }: { lb: number; lo: number; label: string }) {
  if (lb <= 0 || lo <= 0) return null;
  return (
    <Text style={twStyle("mt-1 text-[11px] leading-4 text-emerald-900/85")}>
      {label}
    </Text>
  );
}

export function PerformanceDashboardReportView({ data }: { data: unknown }) {
  const { t } = useTranslation();
  const pd = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t("provider.mobile.screens.performanceDashboardReport." + key, opts) as string,
    [t],
  );
  if (!isDashboardPayload(data)) {
    return <ReportPayloadView data={data} />;
  }

  const basisText = typeof data.reportBasis === "string" ? data.reportBasis : "";
  const basisEntries = data.basis
    ? Object.entries(data.basis).filter(([, v]) => typeof v === "string" && String(v).trim())
    : [];

  const todayBlock = data.today ?? {};
  const weekBlock = data.week ?? {};
  const monthBlock = data.month ?? {};
  const upcoming = Array.isArray(data.upcomingBookings) ? data.upcomingBookings : [];
  const recent = Array.isArray(data.recentBookings) ? data.recentBookings : [];

  const bookedLine = (row: { total_amount?: number | null }) => {
    const n = row.total_amount;
    if (n == null || Number.isNaN(Number(n))) return "—";
    return formatCurrency(Number(n));
  };

  return (
    <View style={twStyle("gap-5 pb-8")}>
      <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>
        {pd("factsDefinitions")}
      </Text>

      {basisText ? (
        <View style={twStyle("rounded-2xl border border-sky-100 bg-sky-50/95 px-4 py-3")}>
          <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-sky-900")}>
            {pd("whatThisCounts")}
          </Text>
          <Text style={twStyle("mt-2 text-sm leading-5 text-sky-950")}>{basisText}</Text>
          {data.timezone ? (
            <Text style={twStyle("mt-2 text-xs text-sky-900/85")}>{pd("timezone", { tz: data.timezone })}</Text>
          ) : null}
        </View>
      ) : null}

      {basisEntries.length > 0 ? (
        <View style={twStyle("rounded-2xl border border-violet-100 bg-violet-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-violet-900")}>
            {pd("definitions")}
          </Text>
          {basisEntries.map(([k, v]) => (
            <Text key={k} style={twStyle("mt-2 text-sm leading-5 text-violet-950")}>
              <Text style={twStyle("font-medium")}>{BASIS_KEYS[k] ? pd(BASIS_KEYS[k]) : k} · </Text>
              {v}
            </Text>
          ))}
        </View>
      ) : null}

      <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>{pd("ledgerToday")}</Text>
      <View style={twStyle("rounded-2xl border border-emerald-100 bg-emerald-50/80 px-4 py-3")}>
        <Text style={twStyle("text-2xl font-semibold tabular-nums text-emerald-950")}>
          {formatCurrency(Number(todayBlock.revenue ?? 0))}
        </Text>
        <SplitNote lb={Number(todayBlock.ledgerFromBookings ?? 0)} lo={Number(todayBlock.ledgerFromProductOrders ?? 0)} label={pd("splitNote", { bookings: formatCurrency(Number(todayBlock.ledgerFromBookings ?? 0)), orders: formatCurrency(Number(todayBlock.ledgerFromProductOrders ?? 0)) })} />
        <Text style={twStyle("mt-2 text-xs text-emerald-900/90")}>
          {pd("appointmentsToday", { bookings: Number(todayBlock.bookings ?? 0), completed: Number(todayBlock.completed ?? 0) })}
        </Text>
      </View>

      <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>{pd("thisWeekLedger")}</Text>
      <View style={twStyle("rounded-2xl border border-indigo-100 bg-indigo-50/85 px-4 py-3")}>
        <Text style={twStyle("text-xs text-indigo-900/85")}>
          {data.windows?.week?.fromYmd} → {data.windows?.week?.toYmd}
        </Text>
        <Text style={twStyle("mt-1 text-2xl font-semibold tabular-nums text-indigo-950")}>
          {formatCurrency(Number(weekBlock.revenue ?? 0))}
        </Text>
        <SplitNote lb={Number(weekBlock.ledgerFromBookings ?? 0)} lo={Number(weekBlock.ledgerFromProductOrders ?? 0)} label={pd("splitNote", { bookings: formatCurrency(Number(weekBlock.ledgerFromBookings ?? 0)), orders: formatCurrency(Number(weekBlock.ledgerFromProductOrders ?? 0)) })} />
        <Text style={twStyle("mt-2 text-xs text-indigo-900/90")}>{pd("scheduledCount", { count: Number(weekBlock.bookings ?? 0) })}</Text>
      </View>

      <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>{pd("thisMonth")}</Text>
      <View style={twStyle("rounded-2xl border border-gray-100 bg-white px-4 py-3")}>
        <Text style={twStyle("text-xs text-gray-500")}>
          {data.windows?.month?.fromYmd} → {data.windows?.month?.toYmd}
        </Text>
        <Text style={twStyle("mt-2 text-xl font-semibold tabular-nums text-gray-900")}>
          {formatCurrency(Number(monthBlock.revenue ?? 0))}
        </Text>
        <SplitNote lb={Number(monthBlock.ledgerFromBookings ?? 0)} lo={Number(monthBlock.ledgerFromProductOrders ?? 0)} label={pd("splitNote", { bookings: formatCurrency(Number(monthBlock.ledgerFromBookings ?? 0)), orders: formatCurrency(Number(monthBlock.ledgerFromProductOrders ?? 0)) })} />
        <Text style={twStyle("mt-2 text-sm text-gray-700")}>
          {pd("monthBookingsClients", { bookings: Number(monthBlock.bookings ?? 0), clients: Number(monthBlock.clients ?? 0) })}
        </Text>
      </View>

      <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>{pd("upcoming")}</Text>
      {upcoming.length === 0 ? (
        <Text style={twStyle("text-sm text-gray-500")}>{pd("noneInScope")}</Text>
      ) : (
        upcoming.map((row, i) => (
          <View
            key={row.id ?? `up-${i}`}
            style={twStyle("flex-row items-center justify-between rounded-xl border border-gray-100 bg-white px-3 py-2.5")}
          >
            <View style={twStyle("flex-1 pe-2")}>
              <Text style={twStyle("text-sm font-medium text-gray-900")}>
                {row.scheduled_at ? format(new Date(row.scheduled_at), "MMM d, h:mm a") : "—"}
              </Text>
              <Text style={twStyle("text-xs text-gray-500")}>
                {formatStatusLabel(row.status)}
              </Text>
            </View>
            <View style={twStyle("items-end")}>
              <Text style={twStyle("text-sm font-semibold tabular-nums text-gray-900")}>{bookedLine(row)}</Text>
              <Text style={twStyle("text-[10px] text-gray-400")}>{pd("booked")}</Text>
            </View>
          </View>
        ))
      )}

      <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>{pd("recent")}</Text>
      {recent.length === 0 ? (
        <Text style={twStyle("text-sm text-gray-500")}>{pd("noneInScope")}</Text>
      ) : (
        recent.map((row, i) => (
          <View
            key={row.id ?? `rec-${i}`}
            style={twStyle("flex-row items-center justify-between rounded-xl border border-gray-100 bg-gray-50/90 px-3 py-2.5")}
          >
            <View style={twStyle("flex-1 pe-2")}>
              <Text style={twStyle("text-sm font-medium text-gray-900")}>
                {row.scheduled_at ? format(new Date(row.scheduled_at), "MMM d, h:mm a") : "—"}
              </Text>
              <Text style={twStyle("text-xs text-gray-500")}>
                {formatStatusLabel(row.status)}
              </Text>
            </View>
            <View style={twStyle("items-end")}>
              <Text style={twStyle("text-sm font-semibold tabular-nums text-gray-900")}>{bookedLine(row)}</Text>
              <Text style={twStyle("text-[10px] text-gray-400")}>{pd("booked")}</Text>
            </View>
          </View>
        ))
      )}
    </View>
  );
}
