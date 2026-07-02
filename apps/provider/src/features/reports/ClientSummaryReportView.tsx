/**
 * Client summary: distinct clients in window, first visits, repeats, spend — facts banner.
 */
import { View, Text } from "react-native";
import { ReportPayloadView } from "@/features/reports/ReportPayloadView";
import { formatCurrency, formatPercentage } from "@/lib/format";
import { twStyle } from "@/lib/twStyle";

function omitKeys(obj: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (keys.includes(k)) continue;
    next[k] = v;
  }
  return next;
}

function isClientSummaryPayload(data: unknown): data is {
  totalClients?: number;
  newClients?: number;
  returningClients?: number;
  averageLifetimeValue?: number;
  averageBookedGross?: number;
  averageLedgerEarnings?: number;
  averageBookingsPerClient?: number;
  topClients?: {
    clientId?: string;
    clientName?: string;
    totalBookings?: number;
    totalSpent?: number;
    ledgerEarnings?: number;
    lastVisit?: string;
    averageRating?: number;
  }[];
  clientRetention?: { retentionRate?: number; inclusiveDayCount?: number; period?: string };
  basisNote?: string;
  reportBasis?: string;
  timezone?: string;
} {
  return data != null && typeof data === "object" && !Array.isArray(data) && "totalClients" in data;
}

export function ClientSummaryReportView({ data }: { data: unknown }) {
  if (!isClientSummaryPayload(data)) {
    return <ReportPayloadView data={data} />;
  }

  const basis = data.basisNote ?? "";
  const total = Number(data.totalClients ?? 0);
  const newC = Number(data.newClients ?? 0);
  const returning = Number(data.returningClients ?? 0);
  const avgBooked = Number(data.averageBookedGross ?? data.averageLifetimeValue ?? 0);
  const avgLedger = Number(data.averageLedgerEarnings ?? 0);
  const avgBk = Number(data.averageBookingsPerClient ?? 0);
  const retRate = data.clientRetention?.retentionRate;
  const days = data.clientRetention?.inclusiveDayCount;
  const top = data.topClients ?? [];

  const detailPayload = omitKeys(data as Record<string, unknown>, [
    "topClients",
    "basisNote",
    "reportBasis",
    "timezone",
    "totalClients",
    "newClients",
    "returningClients",
    "averageLifetimeValue",
    "averageBookingsPerClient",
    "clientRetention",
  ]);

  return (
    <View style={twStyle("gap-5 pb-8")}>
      <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>
        Facts & definitions
      </Text>
      {basis ? (
        <View style={twStyle("rounded-2xl border border-sky-100 bg-sky-50/95 px-4 py-3")}>
          <Text style={twStyle("text-sm leading-5 text-sky-950")}>{basis}</Text>
          {data.timezone ? (
            <Text style={twStyle("mt-2 text-xs text-sky-900/85")}>Timezone: {data.timezone}</Text>
          ) : null}
        </View>
      ) : null}

      <View style={twStyle("flex-row flex-wrap gap-3")}>
        <View style={twStyle("min-w-[148px] flex-1 rounded-2xl border border-blue-100 bg-blue-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-blue-900")}>Clients (window)</Text>
          <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-blue-950")}>{total}</Text>
        </View>
        <View style={twStyle("min-w-[148px] flex-1 rounded-2xl border border-emerald-100 bg-emerald-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-emerald-900")}>New (first in scope)</Text>
          <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-emerald-950")}>{newC}</Text>
        </View>
        <View style={twStyle("min-w-[148px] flex-1 rounded-2xl border border-indigo-100 bg-indigo-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-indigo-900")}>2+ in window</Text>
          <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-indigo-950")}>{returning}</Text>
        </View>
        <View style={twStyle("min-w-[148px] flex-1 rounded-2xl border border-violet-100 bg-violet-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-violet-900")}>Avg booked gross</Text>
          <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-violet-950")}>
            {formatCurrency(avgBooked)}
          </Text>
        </View>
        {data.averageLedgerEarnings != null ? (
          <View style={twStyle("min-w-[148px] flex-1 rounded-2xl border border-emerald-100 bg-emerald-50/90 px-4 py-3")}>
            <Text style={twStyle("text-xs font-medium text-emerald-900")}>Avg ledger earnings</Text>
            <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-emerald-950")}>
              {formatCurrency(avgLedger)}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={twStyle("rounded-2xl border border-gray-100 bg-white px-4 py-3")}>
        <Text style={twStyle("text-xs font-medium text-gray-600")}>Avg bookings / client · retention</Text>
        <Text style={twStyle("mt-1 text-sm text-gray-900")}>
          {avgBk.toFixed(1)} bookings ·{" "}
          {retRate != null ? formatPercentage(retRate) : "—"} repeat rate (2+ visits in window)
          {days != null ? ` · ${days} days` : ""}
        </Text>
      </View>

      <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>
        Top clients (booked gross · ledger in window)
      </Text>
      <View style={twStyle("rounded-2xl border border-gray-100 bg-white")}>
        {top.length === 0 ? (
          <Text style={twStyle("px-4 py-6 text-center text-sm text-gray-500")}>No rows.</Text>
        ) : (
          top.map((c, i) => (
            <View
              key={String(c.clientId ?? i)}
              style={twStyle("flex-row items-center justify-between border-b border-gray-50 px-4 py-3 last:border-b-0")}
            >
              <View style={twStyle("mr-2 flex-1")}>
                <Text style={twStyle("text-sm font-medium text-gray-900")} numberOfLines={1}>
                  {c.clientName}
                </Text>
                <Text style={twStyle("text-xs text-gray-500")}>
                  {c.totalBookings ?? 0} bookings
                  {c.averageRating != null && c.averageRating > 0 ? ` · ★ ${c.averageRating.toFixed(1)}` : ""}
                </Text>
              </View>
              <View style={twStyle("items-end")}>
                <Text style={twStyle("text-sm font-semibold tabular-nums text-gray-900")}>
                  {formatCurrency(Number(c.totalSpent ?? 0))}
                </Text>
                {c.ledgerEarnings != null && c.ledgerEarnings > 0 ? (
                  <Text style={twStyle("text-xs tabular-nums text-emerald-700")}>
                    Ledger {formatCurrency(c.ledgerEarnings)}
                  </Text>
                ) : null}
              </View>
            </View>
          ))
        )}
      </View>

      {Object.keys(detailPayload).length > 0 ? (
        <ReportPayloadView data={detailPayload} title="Extra" />
      ) : null}
    </View>
  );
}
