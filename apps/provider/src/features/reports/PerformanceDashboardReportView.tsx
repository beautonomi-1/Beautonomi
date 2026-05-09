/**
 * Performance dashboard: ledger headline revenue + scheduled booking counts + preview lists.
 */
import { View, Text } from "react-native";
import { format } from "date-fns";
import { ReportPayloadView } from "@/features/reports/ReportPayloadView";
import { formatCurrency } from "@/lib/format";
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
  upcomingBookings?: Array<{
    id?: string;
    scheduled_at?: string;
    status?: string;
    total_amount?: number | null;
  }>;
  recentBookings?: Array<{
    id?: string;
    scheduled_at?: string;
    status?: string;
    total_amount?: number | null;
  }>;
} {
  return data != null && typeof data === "object" && !Array.isArray(data) && "today" in data;
}

const BASIS_LABELS: Record<string, string> = {
  ledgerHeadline: "Ledger",
  bookingCounts: "Bookings",
  todayWindow: "Today",
  weekWindow: "Week",
  monthWindow: "Month",
  upcomingList: "Upcoming",
  recentList: "Recent",
  bookedAmountColumn: "Booked column",
};

function SplitNote({ lb, lo }: { lb: number; lo: number }) {
  if (lb <= 0 || lo <= 0) return null;
  return (
    <Text style={twStyle("mt-1 text-[11px] leading-4 text-emerald-900/85")}>
      Bookings {formatCurrency(lb)} · Orders {formatCurrency(lo)}
    </Text>
  );
}

export function PerformanceDashboardReportView({ data }: { data: unknown }) {
  if (!isDashboardPayload(data)) {
    return <ReportPayloadView data={data} />;
  }

  const basisText = typeof data.reportBasis === "string" ? data.reportBasis : "";
  const basisEntries = data.basis
    ? Object.entries(data.basis).filter(([, v]) => typeof v === "string" && String(v).trim())
    : [];

  const t = data.today ?? {};
  const w = data.week ?? {};
  const m = data.month ?? {};
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
        Facts & definitions
      </Text>

      {basisText ? (
        <View style={twStyle("rounded-2xl border border-sky-100 bg-sky-50/95 px-4 py-3")}>
          <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-sky-900")}>
            What this dashboard counts
          </Text>
          <Text style={twStyle("mt-2 text-sm leading-5 text-sky-950")}>{basisText}</Text>
          {data.timezone ? (
            <Text style={twStyle("mt-2 text-xs text-sky-900/85")}>Timezone · {data.timezone}</Text>
          ) : null}
        </View>
      ) : null}

      {basisEntries.length > 0 ? (
        <View style={twStyle("rounded-2xl border border-violet-100 bg-violet-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-violet-900")}>
            Definitions
          </Text>
          {basisEntries.map(([k, v]) => (
            <Text key={k} style={twStyle("mt-2 text-sm leading-5 text-violet-950")}>
              <Text style={twStyle("font-medium")}>{BASIS_LABELS[k] ?? k} · </Text>
              {v}
            </Text>
          ))}
        </View>
      ) : null}

      <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>Ledger · today</Text>
      <View style={twStyle("rounded-2xl border border-emerald-100 bg-emerald-50/80 px-4 py-3")}>
        <Text style={twStyle("text-2xl font-semibold tabular-nums text-emerald-950")}>
          {formatCurrency(Number(t.revenue ?? 0))}
        </Text>
        <SplitNote lb={Number(t.ledgerFromBookings ?? 0)} lo={Number(t.ledgerFromProductOrders ?? 0)} />
        <Text style={twStyle("mt-2 text-xs text-emerald-900/90")}>
          Appointments today · {Number(t.bookings ?? 0)} ({Number(t.completed ?? 0)} completed)
        </Text>
      </View>

      <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>This week · ledger</Text>
      <View style={twStyle("rounded-2xl border border-indigo-100 bg-indigo-50/85 px-4 py-3")}>
        <Text style={twStyle("text-xs text-indigo-900/85")}>
          {data.windows?.week?.fromYmd} → {data.windows?.week?.toYmd}
        </Text>
        <Text style={twStyle("mt-1 text-2xl font-semibold tabular-nums text-indigo-950")}>
          {formatCurrency(Number(w.revenue ?? 0))}
        </Text>
        <SplitNote lb={Number(w.ledgerFromBookings ?? 0)} lo={Number(w.ledgerFromProductOrders ?? 0)} />
        <Text style={twStyle("mt-2 text-xs text-indigo-900/90")}>Scheduled · {Number(w.bookings ?? 0)}</Text>
      </View>

      <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>This month</Text>
      <View style={twStyle("rounded-2xl border border-gray-100 bg-white px-4 py-3")}>
        <Text style={twStyle("text-xs text-gray-500")}>
          {data.windows?.month?.fromYmd} → {data.windows?.month?.toYmd}
        </Text>
        <Text style={twStyle("mt-2 text-xl font-semibold tabular-nums text-gray-900")}>
          {formatCurrency(Number(m.revenue ?? 0))}
        </Text>
        <SplitNote lb={Number(m.ledgerFromBookings ?? 0)} lo={Number(m.ledgerFromProductOrders ?? 0)} />
        <Text style={twStyle("mt-2 text-sm text-gray-700")}>
          Bookings {Number(m.bookings ?? 0)} · Distinct clients {Number(m.clients ?? 0)}
        </Text>
      </View>

      <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>Upcoming</Text>
      {upcoming.length === 0 ? (
        <Text style={twStyle("text-sm text-gray-500")}>None in this scope.</Text>
      ) : (
        upcoming.map((row, i) => (
          <View
            key={row.id ?? `up-${i}`}
            style={twStyle("flex-row items-center justify-between rounded-xl border border-gray-100 bg-white px-3 py-2.5")}
          >
            <View style={twStyle("flex-1 pr-2")}>
              <Text style={twStyle("text-sm font-medium text-gray-900")}>
                {row.scheduled_at ? format(new Date(row.scheduled_at), "MMM d, h:mm a") : "—"}
              </Text>
              <Text style={twStyle("text-xs capitalize text-gray-500")}>
                {(row.status ?? "").replace(/_/g, " ")}
              </Text>
            </View>
            <View style={twStyle("items-end")}>
              <Text style={twStyle("text-sm font-semibold tabular-nums text-gray-900")}>{bookedLine(row)}</Text>
              <Text style={twStyle("text-[10px] text-gray-400")}>booked</Text>
            </View>
          </View>
        ))
      )}

      <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>Recent</Text>
      {recent.length === 0 ? (
        <Text style={twStyle("text-sm text-gray-500")}>None in this scope.</Text>
      ) : (
        recent.map((row, i) => (
          <View
            key={row.id ?? `rec-${i}`}
            style={twStyle("flex-row items-center justify-between rounded-xl border border-gray-100 bg-gray-50/90 px-3 py-2.5")}
          >
            <View style={twStyle("flex-1 pr-2")}>
              <Text style={twStyle("text-sm font-medium text-gray-900")}>
                {row.scheduled_at ? format(new Date(row.scheduled_at), "MMM d, h:mm a") : "—"}
              </Text>
              <Text style={twStyle("text-xs capitalize text-gray-500")}>
                {(row.status ?? "").replace(/_/g, " ")}
              </Text>
            </View>
            <View style={twStyle("items-end")}>
              <Text style={twStyle("text-sm font-semibold tabular-nums text-gray-900")}>{bookedLine(row)}</Text>
              <Text style={twStyle("text-[10px] text-gray-400")}>booked</Text>
            </View>
          </View>
        ))
      )}
    </View>
  );
}
