/**
 * Booking status: counts by lifecycle vs ledger net attributed to current status (facts banner).
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

function formatStatusLabel(status: string): string {
  return status
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function barColor(status: string): string {
  switch (status) {
    case "completed":
      return "#10b981";
    case "confirmed":
      return "#3b82f6";
    case "pending":
    case "pending_payment":
      return "#fbbf24";
    case "cancelled":
      return "#ef4444";
    case "no_show":
      return "#6b7280";
    case "in_progress":
    case "waiting":
    case "checked_in":
      return "#8b5cf6";
    default:
      return "#94a3b8";
  }
}

const STRIP_PALETTE = [
  "#7c3aed",
  "#0d9488",
  "#f59e0b",
  "#3b82f6",
  "#ec4899",
  "#10b981",
  "#6366f1",
  "#14b8a6",
  "#64748b",
];

type Row = { status: string; count: number; percentage: number; revenue: number };

function isBookingStatusPayload(data: unknown): data is {
  totalBookings?: number;
  completionRate?: number;
  cancellationRate?: number;
  noShowRate?: number;
  bookingsByStatus?: Row[];
  basisNote?: string;
  ledgerTransactionTypes?: string[];
} {
  return data != null && typeof data === "object" && !Array.isArray(data) && "bookingsByStatus" in data;
}

function StatusMixStrip({ rows }: { rows: Row[] }) {
  const filtered = rows.filter((r) => r.count > 0);
  if (filtered.length === 0) {
    return null;
  }
  return (
    <View style={twStyle("mb-4 h-3.5 w-full flex-row overflow-hidden rounded-full bg-gray-100")}>
      {filtered.map((r, i) => (
        <View
          key={r.status}
          style={{
            width: `${Math.min(100, Math.max(0, r.percentage))}%`,
            backgroundColor: STRIP_PALETTE[i % STRIP_PALETTE.length],
            minWidth: r.percentage > 0 && r.percentage < 2 ? 3 : 0,
          }}
        />
      ))}
    </View>
  );
}

export function BookingStatusReportView({ data }: { data: unknown }) {
  if (!isBookingStatusPayload(data)) {
    return <ReportPayloadView data={data} />;
  }

  const rows = Array.isArray(data.bookingsByStatus) ? data.bookingsByStatus : [];
  const basis = data.basisNote ?? "";
  const ledgerTypes = data.ledgerTransactionTypes ?? [];
  const total = Number(data.totalBookings ?? 0);
  const completion = Number(data.completionRate ?? 0);
  const cancelled = Number(data.cancellationRate ?? 0);
  const noShow = Number(data.noShowRate ?? 0);

  const detailPayload = omitKeys(data as Record<string, unknown>, [
    "bookingsByStatus",
    "statusBreakdown",
    "basisNote",
    "ledgerTransactionTypes",
  ]);

  return (
    <View>
      <View style={twStyle("mb-5 gap-4")}>
        <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>
          Facts & definitions
        </Text>
        {basis ? (
          <View style={twStyle("rounded-2xl border border-sky-100 bg-sky-50/95 px-4 py-3")}>
            <Text style={twStyle("text-sm leading-5 text-sky-950")}>{basis}</Text>
            {ledgerTypes.length > 0 ? (
              <Text style={twStyle("mt-2 text-xs leading-5 text-sky-900/90")}>
                Ledger net includes: {ledgerTypes.join(", ")}
              </Text>
            ) : null}
          </View>
        ) : null}

        <View style={twStyle("flex-row flex-wrap gap-3")}>
          <View style={twStyle("min-w-[140px] flex-1 rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-sm")}>
            <Text style={twStyle("text-xs font-medium text-gray-500")}>Appointments in window</Text>
            <Text style={twStyle("mt-1 text-2xl font-semibold tabular-nums text-gray-900")}>{total}</Text>
            <Text style={twStyle("mt-1 text-[11px] leading-4 text-gray-500")}>By scheduled date, all statuses</Text>
          </View>
          <View style={twStyle("min-w-[140px] flex-1 rounded-2xl border border-emerald-100 bg-emerald-50/90 px-4 py-3")}>
            <Text style={twStyle("text-xs font-medium text-emerald-800")}>Completed</Text>
            <Text style={twStyle("mt-1 text-2xl font-semibold tabular-nums text-emerald-900")}>
              {completion.toFixed(1)}%
            </Text>
            <Text style={twStyle("mt-1 text-[11px] leading-4 text-emerald-900/85")}>Share of appointments</Text>
          </View>
          <View style={twStyle("min-w-[140px] flex-1 rounded-2xl border border-red-100 bg-red-50/90 px-4 py-3")}>
            <Text style={twStyle("text-xs font-medium text-red-800")}>Cancelled</Text>
            <Text style={twStyle("mt-1 text-2xl font-semibold tabular-nums text-red-900")}>
              {cancelled.toFixed(1)}%
            </Text>
            <Text style={twStyle("mt-1 text-[11px] leading-4 text-red-900/85")}>Share of appointments</Text>
          </View>
          <View style={twStyle("min-w-[140px] flex-1 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3")}>
            <Text style={twStyle("text-xs font-medium text-gray-700")}>No-show</Text>
            <Text style={twStyle("mt-1 text-2xl font-semibold tabular-nums text-gray-900")}>{noShow.toFixed(1)}%</Text>
            <Text style={twStyle("mt-1 text-[11px] leading-4 text-gray-600")}>Share of appointments</Text>
          </View>
        </View>

        <View style={twStyle("rounded-2xl border border-gray-100 bg-white px-4 py-4 shadow-sm")}>
          <Text style={twStyle("mb-1 text-sm font-semibold text-gray-900")}>Mix by status</Text>
          <Text style={twStyle("mb-3 text-xs leading-5 text-gray-500")}>Share of scheduled appointments (counts).</Text>
          <StatusMixStrip rows={rows} />
          {rows.filter((r) => r.count > 0).length === 0 ? (
            <Text style={twStyle("text-center text-sm text-gray-500")}>No appointments in this range.</Text>
          ) : (
            rows
              .filter((r) => r.count > 0)
              .map((r) => (
                <View
                  key={r.status}
                  style={twStyle("mb-3 flex-row items-center justify-between border-b border-gray-50 pb-3 last:mb-0 last:border-b-0 last:pb-0")}
                >
                  <View style={twStyle("flex-row items-center gap-2")}>
                    <View style={[twStyle("h-2 w-2 rounded-full"), { backgroundColor: barColor(r.status) }]} />
                    <Text style={twStyle("text-sm font-medium text-gray-900")}>{formatStatusLabel(r.status)}</Text>
                  </View>
                  <Text style={twStyle("text-sm tabular-nums text-gray-700")}>
                    {r.count}{" "}
                    <Text style={twStyle("text-xs text-gray-400")}>({r.percentage.toFixed(1)}%)</Text>
                  </Text>
                </View>
              ))
          )}
        </View>

        <View style={twStyle("rounded-2xl border border-gray-100 bg-white px-4 py-4 shadow-sm")}>
          <Text style={twStyle("mb-1 text-sm font-semibold text-gray-900")}>Ledger net by status</Text>
          <Text style={twStyle("mb-4 text-xs leading-5 text-gray-500")}>
            Sum of booking-linked ledger net where the booking currently sits in this status.
          </Text>
          {rows.map((r) => {
            const pct = Math.min(100, Math.max(0, r.percentage));
            return (
              <View key={`rev-${r.status}`} style={twStyle("mb-4 last:mb-0")}>
                <View style={twStyle("mb-1 flex-row items-center justify-between")}>
                  <Text style={twStyle("text-sm font-medium text-gray-900")}>{formatStatusLabel(r.status)}</Text>
                  <Text style={twStyle("text-sm tabular-nums text-gray-800")}>
                    {formatCurrency(r.revenue)}{" "}
                    <Text style={twStyle("text-xs text-gray-400")}>
                      ({r.count} · {pct.toFixed(1)}%)
                    </Text>
                  </Text>
                </View>
                <View style={twStyle("h-2 overflow-hidden rounded-full bg-gray-100")}>
                  <View
                    style={[
                      twStyle("h-full rounded-full"),
                      { width: `${pct}%`, backgroundColor: barColor(r.status) },
                    ]}
                  />
                </View>
              </View>
            );
          })}
        </View>
      </View>

      <ReportPayloadView data={detailPayload} title="Summary fields" />
    </View>
  );
}
