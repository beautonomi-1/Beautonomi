/**
 * Cancellations: counts, rate, ledger net in window, reasons, daily buckets, recent sample.
 */
import { View, Text } from "react-native";
import { ReportPayloadView } from "@/features/reports/ReportPayloadView";
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

function isCancellationsPayload(data: unknown): data is {
  totalCancelled?: number;
  totalBookings?: number;
  cancellationRate?: number;
  lostRevenue?: number;
  cancellationReasons?: { reason: string; count: number; percentage: number }[];
  dailyBreakdown?: { date: string; count: number }[];
  recentCancellations?: unknown[];
  basisNote?: string;
  reportBasis?: string;
  ledgerTransactionTypes?: string[];
  timezone?: string;
} {
  return data != null && typeof data === "object" && !Array.isArray(data) && "totalCancelled" in data;
}

export function CancellationsReportView({ data }: { data: unknown }) {
  if (!isCancellationsPayload(data)) {
    return <ReportPayloadView data={data} />;
  }

  const basis = data.basisNote ?? "";
  const totalCancelled = Number(data.totalCancelled ?? 0);
  const totalBookings = Number(data.totalBookings ?? 0);
  const rate = Number(data.cancellationRate ?? 0);
  const lost = Number(data.lostRevenue ?? 0);
  const reasons = data.cancellationReasons ?? [];
  const daily = data.dailyBreakdown ?? [];
  const recent = data.recentCancellations ?? [];
  const types = data.ledgerTransactionTypes ?? [];

  const detailPayload = omitKeys(data as Record<string, unknown>, [
    "cancellationReasons",
    "dailyBreakdown",
    "recentCancellations",
    "basisNote",
    "reportBasis",
    "ledgerTransactionTypes",
    "timezone",
    "totalCancelled",
    "totalBookings",
    "cancellationRate",
    "lostRevenue",
  ]);

  return (
    <View style={twStyle("gap-5 pb-8")}>
      <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>
        Facts & definitions
      </Text>
      {basis ? (
        <View style={twStyle("rounded-2xl border border-sky-100 bg-sky-50/95 px-4 py-3")}>
          <Text style={twStyle("text-sm leading-5 text-sky-950")}>{basis}</Text>
          {types.length > 0 ? (
            <Text style={twStyle("mt-2 text-xs leading-5 text-sky-900/90")}>
              Ledger types: {types.join(", ")}
            </Text>
          ) : null}
          {data.timezone ? (
            <Text style={twStyle("mt-1 text-xs text-sky-900/85")}>Timezone: {data.timezone}</Text>
          ) : null}
        </View>
      ) : null}

      <View style={twStyle("flex-row flex-wrap gap-3")}>
        <View style={twStyle("min-w-[148px] flex-1 rounded-2xl border border-red-100 bg-red-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-red-900")}>Cancelled</Text>
          <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-red-950")}>{totalCancelled}</Text>
          <Text style={twStyle("mt-1 text-[11px] leading-4 text-red-900/85")}>Scheduled in window</Text>
        </View>
        <View style={twStyle("min-w-[148px] flex-1 rounded-2xl border border-orange-100 bg-orange-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-orange-900")}>Rate</Text>
          <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-orange-950")}>{rate.toFixed(1)}%</Text>
          <Text style={twStyle("mt-1 text-[11px] leading-4 text-orange-900/85")}>Of {totalBookings} appointments</Text>
        </View>
        <View style={twStyle("min-w-[148px] flex-1 rounded-2xl border border-rose-100 bg-rose-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-rose-900")}>Ledger net</Text>
          <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-rose-950")}>{formatCurrency(lost)}</Text>
          <Text style={twStyle("mt-1 text-[11px] leading-4 text-rose-900/85")}>Posted in window</Text>
        </View>
      </View>

      <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>By day</Text>
      <View style={twStyle("rounded-2xl border border-gray-100 bg-white")}>
        {daily.length === 0 ? (
          <Text style={twStyle("px-4 py-6 text-center text-sm text-gray-500")}>No daily rows.</Text>
        ) : (
          daily.map((d) => (
            <View
              key={d.date}
              style={twStyle("flex-row items-center justify-between border-b border-gray-50 px-4 py-3 last:border-b-0")}
            >
              <Text style={twStyle("text-sm font-medium text-gray-900")}>{d.date}</Text>
              <Text style={twStyle("text-sm tabular-nums text-gray-800")}>{d.count}</Text>
            </View>
          ))
        )}
      </View>

      <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>Reasons</Text>
      <View style={twStyle("rounded-2xl border border-gray-100 bg-white")}>
        {reasons.length === 0 ? (
          <Text style={twStyle("px-4 py-6 text-center text-sm text-gray-500")}>No reasons.</Text>
        ) : (
          reasons.map((r) => (
            <View
              key={r.reason}
              style={twStyle("border-b border-gray-50 px-4 py-3 last:border-b-0")}
            >
              <Text style={twStyle("text-sm font-medium text-gray-900")}>{r.reason}</Text>
              <Text style={twStyle("text-xs text-gray-600")}>
                {r.count} · {r.percentage.toFixed(1)}%
              </Text>
            </View>
          ))
        )}
      </View>

      <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>Recent</Text>
      <View style={twStyle("gap-2")}>
        {recent.length === 0 ? (
          <Text style={twStyle("text-sm text-gray-500")}>No recent rows.</Text>
        ) : (
          recent.map((row, i) => {
            const b = row as {
              id?: string;
              cancellation_reason?: string | null;
              total_amount?: number;
              users?: { full_name?: string } | null;
            };
            return (
              <View
                key={String(b.id ?? i)}
                style={twStyle("rounded-xl border border-gray-100 bg-gray-50/50 px-4 py-3")}
              >
                <Text style={twStyle("text-sm font-medium text-gray-900")}>
                  {b.users?.full_name ?? "Unknown client"}
                </Text>
                {b.cancellation_reason ? (
                  <Text style={twStyle("text-xs text-gray-600")}>{b.cancellation_reason}</Text>
                ) : null}
                <Text style={twStyle("text-xs tabular-nums text-gray-800")}>
                  {formatCurrency(Number(b.total_amount ?? 0))}
                </Text>
              </View>
            );
          })
        )}
      </View>

      {Object.keys(detailPayload).length > 0 ? (
        <ReportPayloadView data={detailPayload} title="Extra fields" />
      ) : null}
    </View>
  );
}
