/**
 * Occupancy: booked service minutes vs weekly schedule (facts banner + summary + tables).
 */
import { View, Text } from "react-native";
import { ReportPayloadView } from "@/features/reports/ReportPayloadView";
import { twStyle } from "@/lib/twStyle";

function omitKeys(obj: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (keys.includes(k)) continue;
    next[k] = v;
  }
  return next;
}

function formatPct(p: number | null | undefined): string {
  if (p === null || p === undefined) return "—";
  return `${p}%`;
}

type OccDay = {
  date: string;
  totalAvailable?: number;
  totalBooked?: number;
  availableMinutes?: number;
  bookedMinutes?: number;
  occupancyPercent?: number | null;
};

type Summary = {
  totalAvailableMinutes?: number;
  totalBookedMinutes?: number;
  occupancyPercent?: number | null;
  staffMemberCount?: number;
  dayCount?: number;
};

function buildSummaryFromByDate(byDate: OccDay[]): Summary | null {
  if (!byDate.length) return null;
  let a = 0;
  let b = 0;
  for (const row of byDate) {
    a += Number(row.totalAvailable ?? 0);
    b += Number(row.totalBooked ?? 0);
  }
  const occupancyPercent =
    a > 0 ? Math.round((b / a) * 1000) / 10 : b > 0 ? null : 0;
  return {
    totalAvailableMinutes: a,
    totalBookedMinutes: b,
    occupancyPercent,
    staffMemberCount: undefined,
    dayCount: byDate.length,
  };
}

function isOccupancyPayload(data: unknown): data is {
  byDate?: OccDay[];
  byStaff?: Array<{ staffId?: string; staffName?: string; byDate?: OccDay[] }>;
  summary?: Summary;
  basisNote?: string;
  reportBasis?: string;
  timezone?: string;
  includedBookingStatuses?: string[];
} {
  return data != null && typeof data === "object" && !Array.isArray(data) && "byDate" in data;
}

export function OccupancyReportView({ data }: { data: unknown }) {
  if (!isOccupancyPayload(data)) {
    return <ReportPayloadView data={data} />;
  }

  const summary = data.summary ?? buildSummaryFromByDate(data.byDate ?? []);
  const basis = data.basisNote ?? "";
  const statuses = data.includedBookingStatuses ?? [];

  const detailPayload = omitKeys(data as Record<string, unknown>, [
    "byStaff",
    "byDate",
    "summary",
    "basisNote",
    "reportBasis",
    "includedBookingStatuses",
    "timezone",
  ]);

  const byDate = data.byDate ?? [];
  const byStaff = data.byStaff ?? [];

  return (
    <View style={twStyle("gap-5 pb-8")}>
        <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>
          Facts & definitions
        </Text>
        {basis ? (
          <View style={twStyle("rounded-2xl border border-sky-100 bg-sky-50/95 px-4 py-3")}>
            <Text style={twStyle("text-sm leading-5 text-sky-950")}>{basis}</Text>
            {statuses.length > 0 ? (
              <Text style={twStyle("mt-2 text-xs leading-5 text-sky-900/90")}>
                Booking statuses: {statuses.join(", ")}
              </Text>
            ) : null}
            {data.timezone ? (
              <Text style={twStyle("mt-1 text-xs text-sky-900/85")}>Timezone: {data.timezone}</Text>
            ) : null}
          </View>
        ) : null}

        {summary ? (
          <View style={twStyle("flex-row flex-wrap gap-3")}>
            <View style={twStyle("min-w-[148px] flex-1 rounded-2xl border border-violet-100 bg-violet-50/90 px-4 py-3")}>
              <Text style={twStyle("text-xs font-medium text-violet-900")}>Period occupancy</Text>
              <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-violet-950")}>
                {formatPct(summary.occupancyPercent)}
              </Text>
              <Text style={twStyle("mt-1 text-[11px] leading-4 text-violet-900/85")}>
                Booked ÷ available minutes (whole period)
              </Text>
            </View>
            <View style={twStyle("min-w-[148px] flex-1 rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-sm")}>
              <Text style={twStyle("text-xs font-medium text-gray-600")}>Available (min)</Text>
              <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-gray-900")}>
                {(summary.totalAvailableMinutes ?? 0).toLocaleString()}
              </Text>
            </View>
            <View style={twStyle("min-w-[148px] flex-1 rounded-2xl border border-teal-100 bg-teal-50/90 px-4 py-3")}>
              <Text style={twStyle("text-xs font-medium text-teal-900")}>Booked (min)</Text>
              <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-teal-950")}>
                {(summary.totalBookedMinutes ?? 0).toLocaleString()}
              </Text>
            </View>
            <View style={twStyle("min-w-[148px] flex-1 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3")}>
              <Text style={twStyle("text-xs font-medium text-gray-700")}>Staff · days</Text>
              <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-gray-900")}>
                {summary.staffMemberCount ?? "—"} · {summary.dayCount ?? "—"}
              </Text>
            </View>
          </View>
        ) : null}

        <View style={twStyle("rounded-2xl border border-gray-100 bg-white px-3 py-2")}>
          <Text style={twStyle("text-[11px] leading-4 text-gray-600")}>
            “—” for occupancy means no scheduled availability for that row but bookings exist. Percentages above 100%
            mean booked service minutes exceed summed shift windows.
          </Text>
        </View>

        <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>By date</Text>
        <View style={twStyle("rounded-2xl border border-gray-100 bg-white")}>
          {byDate.map((row) => (
            <View
              key={row.date}
              style={twStyle("flex-row flex-wrap items-center justify-between border-b border-gray-50 px-4 py-3 last:border-b-0")}
            >
              <Text style={twStyle("text-sm font-medium text-gray-900")}>{row.date}</Text>
              <Text style={twStyle("text-sm tabular-nums text-gray-700")}>
                Avail {row.totalAvailable ?? 0} · Booked {row.totalBooked ?? 0} ·{" "}
                <Text style={twStyle("font-semibold text-gray-900")}>{formatPct(row.occupancyPercent ?? null)}</Text>
              </Text>
            </View>
          ))}
        </View>

        {byStaff.length > 0 ? (
          <>
            <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>By staff</Text>
            {byStaff.map((staff) => (
              <View key={staff.staffId ?? staff.staffName} style={twStyle("rounded-2xl border border-gray-100 bg-white px-3 py-2")}>
                <Text style={twStyle("mb-2 px-1 text-sm font-semibold text-gray-900")}>{staff.staffName}</Text>
                {(staff.byDate ?? []).map((row) => (
                  <View
                    key={`${staff.staffId}-${row.date}`}
                    style={twStyle("flex-row flex-wrap items-center justify-between border-b border-gray-50 py-2 last:border-b-0")}
                  >
                    <Text style={twStyle("text-xs text-gray-600")}>{row.date}</Text>
                    <Text style={twStyle("text-xs tabular-nums text-gray-800")}>
                      Avail {row.availableMinutes ?? 0} · Booked {row.bookedMinutes ?? 0} ·{" "}
                      <Text style={twStyle("font-semibold")}>{formatPct(row.occupancyPercent ?? null)}</Text>
                    </Text>
                  </View>
                ))}
              </View>
            ))}
          </>
        ) : null}

        {Object.keys(detailPayload).length > 0 ? (
          <ReportPayloadView data={detailPayload} title="Raw summary fields" />
        ) : null}
    </View>
  );
}
