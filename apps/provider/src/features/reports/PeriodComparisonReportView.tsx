/**
 * Period comparison: current period-to-date vs complete prior calendar period.
 */
import { View, Text } from "react-native";
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

const BASIS_LABELS: Record<string, string> = {
  currentWindow: "Current",
  previousWindow: "Previous",
  ledgerHeadline: "Ledger",
  averagePerBooking: "Avg / booking",
  bookings: "Bookings",
  growth: "Growth",
};

function GrowthText({ v }: { v: number }) {
  const up = v >= 0;
  return (
    <Text style={twStyle(`text-sm font-semibold ${up ? "text-green-700" : "text-red-600"}`)}>
      {up ? "+" : ""}
      {v.toFixed(1)}% vs previous
    </Text>
  );
}

export function PeriodComparisonReportView({ data }: { data: unknown }) {
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

  return (
    <View style={twStyle("gap-5 pb-8")}>
      <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>
        Facts & definitions
      </Text>

      {wc?.fromYmd && wc?.toYmd ? (
        <View style={twStyle("rounded-xl border border-gray-100 bg-gray-50 px-4 py-3")}>
          <Text style={twStyle("text-sm text-gray-800")}>
            Current · {wc.fromYmd} → {wc.toYmd}
            {wc.description ? ` · ${wc.description}` : ""}
          </Text>
          {wp?.fromYmd && wp?.toYmd ? (
            <Text style={twStyle("mt-1 text-sm text-gray-800")}>
              Previous · {wp.fromYmd} → {wp.toYmd}
              {wp.description ? ` · ${wp.description}` : ""}
            </Text>
          ) : null}
          {data.timezone ? (
            <Text style={twStyle("mt-2 text-xs text-gray-600")}>Timezone · {data.timezone}</Text>
          ) : null}
        </View>
      ) : null}

      {basisText ? (
        <View style={twStyle("rounded-2xl border border-sky-100 bg-sky-50/95 px-4 py-3")}>
          <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-sky-900")}>
            What this compares
          </Text>
          <Text style={twStyle("mt-2 text-sm leading-5 text-sky-950")}>{basisText}</Text>
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

      <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>Ledger earnings</Text>
      <View style={twStyle("rounded-2xl border border-emerald-100 bg-emerald-50/80 px-4 py-3")}>
        <Text style={twStyle("text-sm text-emerald-900")}>Current {formatCurrency(Number(c.revenue ?? 0))}</Text>
        <Text style={twStyle("mt-1 text-sm text-emerald-900")}>Previous {formatCurrency(Number(p.revenue ?? 0))}</Text>
        <View style={twStyle("mt-2")}>
          <GrowthText v={Number(g.revenue ?? 0)} />
        </View>
      </View>

      <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>Scheduled bookings</Text>
      <View style={twStyle("rounded-2xl border border-gray-100 bg-white px-4 py-3")}>
        <Text style={twStyle("text-sm text-gray-900")}>
          Current {Number(c.bookings ?? 0)} ({Number(c.completed ?? 0)} completed)
        </Text>
        <Text style={twStyle("mt-1 text-sm text-gray-700")}>
          Previous {Number(p.bookings ?? 0)} ({Number(p.completed ?? 0)} completed)
        </Text>
        <View style={twStyle("mt-2")}>
          <GrowthText v={Number(g.bookings ?? 0)} />
        </View>
      </View>

      <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>Distinct clients</Text>
      <View style={twStyle("rounded-2xl border border-gray-100 bg-gray-50/90 px-4 py-3")}>
        <Text style={twStyle("text-sm text-gray-900")}>Current {Number(c.clients ?? 0)}</Text>
        <Text style={twStyle("mt-1 text-sm text-gray-700")}>Previous {Number(p.clients ?? 0)}</Text>
        <View style={twStyle("mt-2")}>
          <GrowthText v={Number(g.clients ?? 0)} />
        </View>
      </View>

      <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>
        Avg ledger / booking
      </Text>
      <View style={twStyle("rounded-2xl border border-indigo-100 bg-indigo-50/85 px-4 py-3")}>
        <Text style={twStyle("text-sm text-indigo-950")}>Current {formatCurrency(curAvg)}</Text>
        <Text style={twStyle("mt-1 text-sm text-indigo-900")}>Previous {formatCurrency(prevAvg)}</Text>
        <View style={twStyle("mt-2")}>
          <GrowthText v={avgG} />
        </View>
      </View>
    </View>
  );
}
