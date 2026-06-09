/**
 * Formatted detail views for reports that previously fell back to the raw JSON
 * payload viewer: staff commission, staff hours, no-shows, new clients, and
 * client lifetime value. Each guards its payload shape and degrades to
 * `ReportPayloadView` if the response is unexpected.
 */
import { View, Text } from "react-native";
import { ReportPayloadView } from "@/features/reports/ReportPayloadView";
import { formatCurrency, formatPercentage, formatDate } from "@/lib/format";
import { twStyle } from "@/lib/twStyle";

function isObj(data: unknown, key: string): data is Record<string, unknown> {
  return data != null && typeof data === "object" && !Array.isArray(data) && key in data;
}

function Metric({
  label,
  value,
  tone = "gray",
}: {
  label: string;
  value: string;
  tone?: "gray" | "emerald" | "blue" | "amber" | "violet";
}) {
  const toneMap: Record<string, string> = {
    gray: "border-gray-100 bg-gray-50/90 text-gray-900",
    emerald: "border-emerald-100 bg-emerald-50/90 text-emerald-950",
    blue: "border-blue-100 bg-blue-50/90 text-blue-950",
    amber: "border-amber-100 bg-amber-50/90 text-amber-950",
    violet: "border-violet-100 bg-violet-50/90 text-violet-950",
  };
  return (
    <View style={twStyle(`min-w-[148px] flex-1 rounded-2xl border px-4 py-3 ${toneMap[tone]}`)}>
      <Text style={twStyle("text-xs font-medium opacity-80")}>{label}</Text>
      <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums")}>{value}</Text>
    </View>
  );
}

function BasisBanner({ note, timezone }: { note?: string; timezone?: string }) {
  if (!note) return null;
  return (
    <View style={twStyle("rounded-2xl border border-sky-100 bg-sky-50/95 px-4 py-3")}>
      <Text style={twStyle("text-sm leading-5 text-sky-950")}>{note}</Text>
      {timezone ? <Text style={twStyle("mt-2 text-xs text-sky-900/85")}>Timezone: {timezone}</Text> : null}
    </View>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>{children}</Text>
  );
}

function Row({
  title,
  subtitle,
  primary,
  secondary,
}: {
  title: string;
  subtitle?: string;
  primary: string;
  secondary?: string;
}) {
  return (
    <View style={twStyle("flex-row items-center justify-between border-b border-gray-50 px-4 py-3 last:border-b-0")}>
      <View style={twStyle("mr-2 flex-1")}>
        <Text style={twStyle("text-sm font-medium text-gray-900")} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? <Text style={twStyle("text-xs text-gray-500")}>{subtitle}</Text> : null}
      </View>
      <View style={twStyle("items-end")}>
        <Text style={twStyle("text-sm font-semibold tabular-nums text-gray-900")}>{primary}</Text>
        {secondary ? <Text style={twStyle("text-xs tabular-nums text-gray-500")}>{secondary}</Text> : null}
      </View>
    </View>
  );
}

function EmptyRows({ label }: { label: string }) {
  return <Text style={twStyle("px-4 py-6 text-center text-sm text-gray-500")}>{label}</Text>;
}

const num = (v: unknown) => Number(v ?? 0);

/* ------------------------------------------------------------------ */

export function StaffCommissionReportView({ data }: { data: unknown }) {
  if (!isObj(data, "staffCommissions")) return <ReportPayloadView data={data} />;
  const rows = (data.staffCommissions as Array<Record<string, unknown>>) ?? [];
  return (
    <View style={twStyle("gap-5 pb-8")}>
      <View style={twStyle("flex-row flex-wrap gap-3")}>
        <Metric label="Total commission" value={formatCurrency(num(data.totalCommission))} tone="emerald" />
        <Metric label="Revenue base" value={formatCurrency(num(data.totalRevenue))} tone="blue" />
        <Metric label="Avg rate" value={formatPercentage(num(data.averageCommissionRate))} tone="violet" />
      </View>
      <SectionLabel>Commission by staff</SectionLabel>
      <View style={twStyle("rounded-2xl border border-gray-100 bg-white")}>
        {rows.length === 0 ? (
          <EmptyRows label="No staff commission in this range." />
        ) : (
          rows.map((r, i) => (
            <Row
              key={String(r.staffId ?? i)}
              title={String(r.staffName ?? "Unknown")}
              subtitle={`${num(r.totalBookings)} bookings · ${formatPercentage(num(r.commissionRate))} rate`}
              primary={formatCurrency(num(r.totalCommission))}
              secondary={`Rev ${formatCurrency(num(r.totalRevenue))}`}
            />
          ))
        )}
      </View>
    </View>
  );
}

export function StaffHoursReportView({ data }: { data: unknown }) {
  if (!isObj(data, "staffHours")) return <ReportPayloadView data={data} />;
  const rows = (data.staffHours as Array<Record<string, unknown>>) ?? [];
  return (
    <View style={twStyle("gap-5 pb-8")}>
      <View style={twStyle("flex-row flex-wrap gap-3")}>
        <Metric label="Worked hours" value={`${num(data.totalHours).toFixed(1)}h`} tone="emerald" />
        <Metric label="Scheduled hours" value={`${num(data.totalScheduledHours).toFixed(1)}h`} tone="blue" />
        <Metric label="Avg / staff" value={`${num(data.averageHoursPerStaff).toFixed(1)}h`} tone="violet" />
      </View>
      <SectionLabel>Hours & attendance by staff</SectionLabel>
      <View style={twStyle("rounded-2xl border border-gray-100 bg-white")}>
        {rows.length === 0 ? (
          <EmptyRows label="No worked hours in this range." />
        ) : (
          rows.map((r, i) => (
            <Row
              key={String(r.staffId ?? i)}
              title={String(r.staffName ?? "Unknown")}
              subtitle={`${num(r.completedBookings)} completed · ${formatPercentage(num(r.attendanceRate))} attendance`}
              primary={`${num(r.totalHours).toFixed(1)}h`}
              secondary={`${formatPercentage(num(r.onTimeRate))} on time`}
            />
          ))
        )}
      </View>
    </View>
  );
}

export function NoShowsReportView({ data }: { data: unknown }) {
  if (!isObj(data, "totalNoShows")) return <ReportPayloadView data={data} />;
  const repeatOffenders = (data.repeatOffenders as Array<Record<string, unknown>>) ?? [];
  const staffBreakdown = (data.staffBreakdown as Array<Record<string, unknown>>) ?? [];
  return (
    <View style={twStyle("gap-5 pb-8")}>
      <BasisBanner note={typeof data.basisNote === "string" ? data.basisNote : undefined} />
      <View style={twStyle("flex-row flex-wrap gap-3")}>
        <Metric label="No-shows" value={String(num(data.totalNoShows))} tone="amber" />
        <Metric label="No-show rate" value={formatPercentage(num(data.noShowRate))} tone="amber" />
        <Metric label="Ledger net recognised" value={formatCurrency(num(data.ledgerNetRecognized ?? data.lostRevenue))} />
      </View>
      <SectionLabel>Repeat offenders (2+)</SectionLabel>
      <View style={twStyle("rounded-2xl border border-gray-100 bg-white")}>
        {repeatOffenders.length === 0 ? (
          <EmptyRows label="No repeat no-shows in this range." />
        ) : (
          repeatOffenders.map((r, i) => (
            <Row
              key={String(r.email ?? i)}
              title={String(r.name ?? "Unknown")}
              subtitle={`${num(r.count)} no-shows`}
              primary={formatCurrency(num(r.booked_value))}
              secondary="booked value"
            />
          ))
        )}
      </View>
      {staffBreakdown.length > 0 ? (
        <>
          <SectionLabel>By staff</SectionLabel>
          <View style={twStyle("rounded-2xl border border-gray-100 bg-white")}>
            {staffBreakdown.map((r, i) => (
              <Row key={String(r.name ?? i)} title={String(r.name ?? "Unknown")} primary={`${num(r.count)}`} />
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

export function NewClientsReportView({ data }: { data: unknown }) {
  if (!isObj(data, "totalNewClients")) return <ReportPayloadView data={data} />;
  const rows = (data.newClients as Array<Record<string, unknown>>) ?? [];
  return (
    <View style={twStyle("gap-5 pb-8")}>
      <BasisBanner note={typeof data.basisNote === "string" ? data.basisNote : undefined} />
      <View style={twStyle("flex-row flex-wrap gap-3")}>
        <Metric label="New clients" value={String(num(data.totalNewClients))} tone="emerald" />
        <Metric label="Returned" value={`${num(data.returnedClients)} (${formatPercentage(num(data.returnRate))})`} tone="blue" />
        <Metric label="Avg first booking" value={formatCurrency(num(data.averageFirstBookingValue))} tone="violet" />
      </View>
      <SectionLabel>New clients (most recent)</SectionLabel>
      <View style={twStyle("rounded-2xl border border-gray-100 bg-white")}>
        {rows.length === 0 ? (
          <EmptyRows label="No new clients in this range." />
        ) : (
          rows.map((r, i) => (
            <Row
              key={String(r.customerId ?? i)}
              title={String(r.clientName ?? "Unknown")}
              subtitle={`First visit ${formatDate(String(r.firstVisit ?? ""))}${r.hasReturned ? " · returned" : ""}`}
              primary={formatCurrency(num(r.firstBookingValue))}
              secondary={`${num(r.totalBookings)} bookings`}
            />
          ))
        )}
      </View>
    </View>
  );
}

export function ClientLifetimeValueReportView({ data }: { data: unknown }) {
  if (!isObj(data, "topClients")) return <ReportPayloadView data={data} />;
  const rows = (data.topClients as Array<Record<string, unknown>>) ?? [];
  const segments = (data.ltvSegments as Array<Record<string, unknown>>) ?? [];
  return (
    <View style={twStyle("gap-5 pb-8")}>
      <BasisBanner note={typeof data.basisNote === "string" ? data.basisNote : undefined} />
      <View style={twStyle("flex-row flex-wrap gap-3")}>
        <Metric label="Clients" value={String(num(data.totalClients))} tone="blue" />
        <Metric label="Avg LTV" value={formatCurrency(num(data.averageLTV))} tone="emerald" />
        <Metric label="Median LTV" value={formatCurrency(num(data.medianLTV))} tone="violet" />
        <Metric label="Avg visits" value={num(data.averageVisits).toFixed(1)} />
      </View>
      {segments.length > 0 ? (
        <>
          <SectionLabel>Segments</SectionLabel>
          <View style={twStyle("rounded-2xl border border-gray-100 bg-white")}>
            {segments.map((s, i) => (
              <Row
                key={String(s.segment ?? i)}
                title={String(s.segment ?? "—")}
                subtitle={`${num(s.count)} clients`}
                primary={formatCurrency(num(s.avgLTV))}
                secondary="avg LTV"
              />
            ))}
          </View>
        </>
      ) : null}
      <SectionLabel>Top clients (completed booked gross)</SectionLabel>
      <View style={twStyle("rounded-2xl border border-gray-100 bg-white")}>
        {rows.length === 0 ? (
          <EmptyRows label="No completed bookings yet." />
        ) : (
          rows.map((r, i) => (
            <Row
              key={String(r.customerId ?? i)}
              title={String(r.clientName ?? "Unknown")}
              subtitle={`${num(r.totalBookings)} bookings · ${num(r.visitsPerMonth).toFixed(1)}/mo`}
              primary={formatCurrency(num(r.totalSpent))}
              secondary={`Avg ${formatCurrency(num(r.averageBookingValue))}`}
            />
          ))
        )}
      </View>
    </View>
  );
}
