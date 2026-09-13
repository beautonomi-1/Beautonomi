/**
 * Formatted detail views for reports that previously fell back to the raw JSON
 * payload viewer: staff commission, staff hours, no-shows, new clients, and
 * client lifetime value. Each guards its payload shape and degrades to
 * `ReportPayloadView` if the response is unexpected.
 */
import { View, Text } from "react-native";
import { useTranslation } from "@beautonomi/i18n";
import { ReportPayloadView } from "@/features/reports/ReportPayloadView";
import { formatCurrency, formatPercentage, formatDate } from "@/lib/format";
import { twStyle } from "@/lib/twStyle";

function isObj(data: unknown, key: string): data is Record<string, unknown> {
  return data != null && typeof data === "object" && !Array.isArray(data) && key in data;
}

function useGf() {
  const { t } = useTranslation();
  return (key: string, opts?: Record<string, unknown>) =>
    t(`provider.mobile.screens.genericFormattedReports.${key}`, opts) as string;
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
  const gf = useGf();
  if (!note) return null;
  return (
    <View style={twStyle("rounded-2xl border border-sky-100 bg-sky-50/95 px-4 py-3")}>
      <Text style={twStyle("text-sm leading-5 text-sky-950")}>{note}</Text>
      {timezone ? <Text style={twStyle("mt-2 text-xs text-sky-900/85")}>{gf("timezone", { tz: timezone })}</Text> : null}
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
      <View style={twStyle("me-2 flex-1")}>
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
  const gf = useGf();
  if (!isObj(data, "staffCommissions")) return <ReportPayloadView data={data} />;
  const rows = (data.staffCommissions as Array<Record<string, unknown>>) ?? [];
  const zeroCommissionWarning =
    typeof data.zeroCommissionServiceWarning === "string" ? data.zeroCommissionServiceWarning : null;
  return (
    <View style={twStyle("gap-5 pb-8")}>
      {zeroCommissionWarning ? (
        <View style={twStyle("rounded-2xl border border-amber-100 bg-amber-50/95 px-4 py-3")}>
          <Text style={twStyle("text-sm leading-5 text-amber-950")}>
            {gf("commissionWarning", { warning: zeroCommissionWarning })}
          </Text>
        </View>
      ) : null}
      <View style={twStyle("flex-row flex-wrap gap-3")}>
        <Metric label={gf("totalCommission")} value={formatCurrency(num(data.totalCommission))} tone="emerald" />
        <Metric label={gf("revenueBase")} value={formatCurrency(num(data.totalRevenue))} tone="blue" />
        <Metric label={gf("avgRate")} value={formatPercentage(num(data.averageCommissionRate))} tone="violet" />
      </View>
      <SectionLabel>{gf("commissionByStaff")}</SectionLabel>
      <View style={twStyle("rounded-2xl border border-gray-100 bg-white")}>
        {rows.length === 0 ? (
          <EmptyRows label={gf("emptyCommission")} />
        ) : (
          rows.map((r, i) => (
            <Row
              key={String(r.staffId ?? i)}
              title={String(r.staffName ?? gf("unknown"))}
              subtitle={gf("bookingsRate", { count: num(r.totalBookings), rate: formatPercentage(num(r.commissionRate)) })}
              primary={formatCurrency(num(r.totalCommission))}
              secondary={gf("revAmount", { amount: formatCurrency(num(r.totalRevenue)) })}
            />
          ))
        )}
      </View>
    </View>
  );
}

export function StaffHoursReportView({ data }: { data: unknown }) {
  const gf = useGf();
  if (!isObj(data, "staffHours")) return <ReportPayloadView data={data} />;
  const rows = (data.staffHours as Array<Record<string, unknown>>) ?? [];
  return (
    <View style={twStyle("gap-5 pb-8")}>
      <View style={twStyle("flex-row flex-wrap gap-3")}>
        <Metric label={gf("workedHours")} value={gf("hoursValue", { hours: num(data.totalHours).toFixed(1) })} tone="emerald" />
        <Metric label={gf("scheduledHours")} value={gf("hoursValue", { hours: num(data.totalScheduledHours).toFixed(1) })} tone="blue" />
        <Metric label={gf("avgPerStaff")} value={gf("hoursValue", { hours: num(data.averageHoursPerStaff).toFixed(1) })} tone="violet" />
      </View>
      <SectionLabel>{gf("hoursByStaff")}</SectionLabel>
      <View style={twStyle("rounded-2xl border border-gray-100 bg-white")}>
        {rows.length === 0 ? (
          <EmptyRows label={gf("emptyHours")} />
        ) : (
          rows.map((r, i) => (
            <Row
              key={String(r.staffId ?? i)}
              title={String(r.staffName ?? gf("unknown"))}
              subtitle={gf("completedAttendance", {
                count: num(r.completedBookings),
                rate: formatPercentage(num(r.attendanceRate)),
              })}
              primary={gf("hoursValue", { hours: num(r.totalHours).toFixed(1) })}
              secondary={gf("onTime", { rate: formatPercentage(num(r.onTimeRate)) })}
            />
          ))
        )}
      </View>
    </View>
  );
}

export function NoShowsReportView({ data }: { data: unknown }) {
  const gf = useGf();
  if (!isObj(data, "totalNoShows")) return <ReportPayloadView data={data} />;
  const repeatOffenders = (data.repeatOffenders as Array<Record<string, unknown>>) ?? [];
  const staffBreakdown = (data.staffBreakdown as Array<Record<string, unknown>>) ?? [];
  return (
    <View style={twStyle("gap-5 pb-8")}>
      <BasisBanner note={typeof data.basisNote === "string" ? data.basisNote : undefined} />
      <View style={twStyle("flex-row flex-wrap gap-3")}>
        <Metric label={gf("noShows")} value={String(num(data.totalNoShows))} tone="amber" />
        <Metric label={gf("noShowRate")} value={formatPercentage(num(data.noShowRate))} tone="amber" />
        <Metric label={gf("ledgerNetRecognised")} value={formatCurrency(num(data.ledgerNetRecognized ?? data.lostRevenue))} />
      </View>
      <SectionLabel>{gf("repeatOffenders")}</SectionLabel>
      <View style={twStyle("rounded-2xl border border-gray-100 bg-white")}>
        {repeatOffenders.length === 0 ? (
          <EmptyRows label={gf("emptyRepeat")} />
        ) : (
          repeatOffenders.map((r, i) => (
            <Row
              key={String(r.email ?? i)}
              title={String(r.name ?? gf("unknown"))}
              subtitle={gf("noShowsCount", { count: num(r.count) })}
              primary={formatCurrency(num(r.booked_value))}
              secondary={gf("bookedValue")}
            />
          ))
        )}
      </View>
      {staffBreakdown.length > 0 ? (
        <>
          <SectionLabel>{gf("byStaff")}</SectionLabel>
          <View style={twStyle("rounded-2xl border border-gray-100 bg-white")}>
            {staffBreakdown.map((r, i) => (
              <Row key={String(r.name ?? i)} title={String(r.name ?? gf("unknown"))} primary={`${num(r.count)}`} />
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

export function NewClientsReportView({ data }: { data: unknown }) {
  const gf = useGf();
  if (!isObj(data, "totalNewClients")) return <ReportPayloadView data={data} />;
  const rows = (data.newClients as Array<Record<string, unknown>>) ?? [];
  return (
    <View style={twStyle("gap-5 pb-8")}>
      <BasisBanner note={typeof data.basisNote === "string" ? data.basisNote : undefined} />
      <View style={twStyle("flex-row flex-wrap gap-3")}>
        <Metric label={gf("newClients")} value={String(num(data.totalNewClients))} tone="emerald" />
        <Metric label={gf("returned")} value={gf("returnedValue", { count: num(data.returnedClients), rate: formatPercentage(num(data.returnRate)) })} tone="blue" />
        <Metric label={gf("avgFirstBooking")} value={formatCurrency(num(data.averageFirstBookingValue))} tone="violet" />
      </View>
      <SectionLabel>{gf("newClientsRecent")}</SectionLabel>
      <View style={twStyle("rounded-2xl border border-gray-100 bg-white")}>
        {rows.length === 0 ? (
          <EmptyRows label={gf("emptyNewClients")} />
        ) : (
          rows.map((r, i) => (
            <Row
              key={String(r.customerId ?? i)}
              title={String(r.clientName ?? gf("unknown"))}
              subtitle={
                r.hasReturned
                  ? gf("firstVisitReturned", { date: formatDate(String(r.firstVisit ?? "")) })
                  : gf("firstVisit", { date: formatDate(String(r.firstVisit ?? "")) })
              }
              primary={formatCurrency(num(r.firstBookingValue))}
              secondary={gf("bookingsCount", { count: num(r.totalBookings) })}
            />
          ))
        )}
      </View>
    </View>
  );
}

export function ClientLifetimeValueReportView({ data }: { data: unknown }) {
  const gf = useGf();
  if (!isObj(data, "topClients")) return <ReportPayloadView data={data} />;
  const rows = (data.topClients as Array<Record<string, unknown>>) ?? [];
  const segments = (data.ltvSegments as Array<Record<string, unknown>>) ?? [];
  return (
    <View style={twStyle("gap-5 pb-8")}>
      <BasisBanner note={typeof data.basisNote === "string" ? data.basisNote : undefined} />
      <View style={twStyle("flex-row flex-wrap gap-3")}>
        <Metric label={gf("clients")} value={String(num(data.totalClients))} tone="blue" />
        <Metric label={gf("avgLtv")} value={formatCurrency(num(data.averageLTV))} tone="emerald" />
        <Metric label={gf("medianLtv")} value={formatCurrency(num(data.medianLTV))} tone="violet" />
        <Metric label={gf("avgVisits")} value={num(data.averageVisits).toFixed(1)} />
      </View>
      {segments.length > 0 ? (
        <>
          <SectionLabel>{gf("segments")}</SectionLabel>
          <View style={twStyle("rounded-2xl border border-gray-100 bg-white")}>
            {segments.map((s, i) => (
              <Row
                key={String(s.segment ?? i)}
                title={String(s.segment ?? gf("emptyValue"))}
                subtitle={gf("clientsCount", { count: num(s.count) })}
                primary={formatCurrency(num(s.avgLTV))}
                secondary={gf("avgLtvSecondary")}
              />
            ))}
          </View>
        </>
      ) : null}
      <SectionLabel>{gf("topClients")}</SectionLabel>
      <View style={twStyle("rounded-2xl border border-gray-100 bg-white")}>
        {rows.length === 0 ? (
          <EmptyRows label={gf("emptyTopClients")} />
        ) : (
          rows.map((r, i) => (
            <Row
              key={String(r.customerId ?? i)}
              title={String(r.clientName ?? gf("unknown"))}
              subtitle={gf("bookingsPerMonth", { count: num(r.totalBookings), visits: num(r.visitsPerMonth).toFixed(1) })}
              primary={formatCurrency(num(r.totalSpent))}
              secondary={gf("avgAmount", { amount: formatCurrency(num(r.averageBookingValue)) })}
            />
          ))
        )}
      </View>
    </View>
  );
}
