/**
 * Package sales: booked package line value (packageReportBookedValue), not booking.total_amount.
 */
import { useCallback } from "react";
import { View, Text } from "react-native";
import { useTranslation } from "@beautonomi/i18n";
import { ReportPayloadView } from "@/features/reports/ReportPayloadView";
import { formatCurrency } from "@/lib/format";
import { twStyle } from "@/lib/twStyle";

type PackageSaleRow = {
  packageId?: string;
  packageName?: string;
  bookings?: number;
  revenue?: number;
  averageValue?: number;
};

function isPackageSalesPayload(data: unknown): data is {
  reportBasis?: string;
  timezone?: string;
  fromYmd?: string;
  toYmd?: string;
  basis?: Record<string, string>;
  totalPackagesSold: number;
  totalRevenue: number;
  averagePackageValue: number;
  packageSales?: PackageSaleRow[];
} {
  return (
    data != null &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    typeof (data as { totalPackagesSold?: unknown }).totalPackagesSold === "number" &&
    typeof (data as { totalRevenue?: unknown }).totalRevenue === "number"
  );
}

const BASIS_KEYS: Record<string, string> = {
  window: "basisWindow",
  bookingStatuses: "basisBookingStatuses",
  revenue: "basisRevenue",
  counts: "basisCounts",
};

export function PackageSalesReportView({ data }: { data: unknown }) {
  const { t } = useTranslation();
  const ps = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.screens.packageSalesReport.${key}`, opts) as string,
    [t],
  );

  if (!isPackageSalesPayload(data)) {
    return <ReportPayloadView data={data} />;
  }

  const basisText = typeof data.reportBasis === "string" ? data.reportBasis : "";
  const tz = typeof data.timezone === "string" ? data.timezone : "";
  const period =
    typeof data.fromYmd === "string" && typeof data.toYmd === "string"
      ? `${data.fromYmd} – ${data.toYmd}`
      : "";

  const basisEntries = data.basis
    ? Object.entries(data.basis).filter(([, v]) => typeof v === "string" && String(v).trim())
    : [];

  const rows = Array.isArray(data.packageSales) ? data.packageSales : [];

  return (
    <View style={twStyle("gap-5 pb-8")}>
      <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>
        {ps("factsDefinitions")}
      </Text>

      {basisText ? (
        <View style={twStyle("rounded-2xl border border-sky-100 bg-sky-50/95 px-4 py-3")}>
          <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-sky-900")}>
            {ps("whatThisCounts")}
          </Text>
          <Text style={twStyle("mt-2 text-sm leading-5 text-sky-950")}>{basisText}</Text>
          <View style={twStyle("mt-2 gap-1")}>
            {tz ? (
              <Text style={twStyle("text-xs text-sky-900/85")}>{ps("timezone", { tz })}</Text>
            ) : null}
            {period ? (
              <Text style={twStyle("text-xs text-sky-900/85")}>{ps("calendarWindow", { period })}</Text>
            ) : null}
          </View>
        </View>
      ) : null}

      {basisEntries.length > 0 ? (
        <View style={twStyle("rounded-2xl border border-violet-100 bg-violet-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-violet-900")}>
            {ps("definitions")}
          </Text>
          {basisEntries.map(([k, v]) => (
            <Text key={k} style={twStyle("mt-2 text-sm leading-5 text-violet-950")}>
              <Text style={twStyle("font-medium")}>{BASIS_KEYS[k] ? ps(BASIS_KEYS[k]) : k} · </Text>
              {v}
            </Text>
          ))}
        </View>
      ) : null}

      <View style={twStyle("flex-row flex-wrap gap-3")}>
        <View style={twStyle("min-w-[140px] flex-1 rounded-2xl border border-teal-100 bg-teal-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-teal-900")}>{ps("bookingsInWindow")}</Text>
          <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-teal-950")}>
            {data.totalPackagesSold}
          </Text>
          <Text style={twStyle("mt-1 text-[11px] leading-4 text-teal-900/90")}>
            {ps("bookingsHint")}
          </Text>
        </View>
        <View style={twStyle("min-w-[140px] flex-1 rounded-2xl border border-emerald-100 bg-emerald-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-emerald-900")}>{ps("bookedPackageValue")}</Text>
          <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-emerald-950")}>
            {formatCurrency(data.totalRevenue)}
          </Text>
          <Text style={twStyle("mt-1 text-[11px] leading-4 text-emerald-900/90")}>
            {ps("bookedValueHint")}
          </Text>
        </View>
      </View>

      <View style={twStyle("rounded-2xl border border-slate-100 bg-slate-50/90 px-4 py-3")}>
        <Text style={twStyle("text-xs font-medium text-slate-900")}>{ps("avgBookedValue")}</Text>
        <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-slate-950")}>
          {formatCurrency(data.averagePackageValue)}
        </Text>
        <Text style={twStyle("mt-1 text-[11px] leading-4 text-slate-800/90")}>
          {ps("avgHint")}
        </Text>
      </View>

      <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>
        {ps("byPackage")}
      </Text>
      {rows.length === 0 ? (
        <Text style={twStyle("text-sm text-gray-500")}>{ps("empty")}</Text>
      ) : (
        rows.map((p, i) => (
          <View
            key={p.packageId ?? `${p.packageName ?? "pkg"}-${i}`}
            style={twStyle(
              "flex-row items-center justify-between rounded-2xl border border-gray-100 bg-white px-4 py-3",
            )}
          >
            <View style={twStyle("flex-1 pe-3")}>
              <View style={twStyle("flex-row items-center gap-2")}>
                <View style={twStyle("h-8 w-8 items-center justify-center rounded-full bg-teal-600")}>
                  <Text style={twStyle("text-xs font-bold text-white")}>{i + 1}</Text>
                </View>
                <Text style={twStyle("flex-1 font-medium text-gray-900")} numberOfLines={2}>
                  {p.packageName ?? ps("packageFallback")}
                </Text>
              </View>
              <Text style={twStyle("mt-1 ps-10 text-xs text-gray-500")}>
                {typeof p.averageValue === "number"
                  ? ps("bookingsAvg", { count: Number(p.bookings ?? 0), amount: formatCurrency(p.averageValue) })
                  : ps("bookingsCount", { count: Number(p.bookings ?? 0) })}
              </Text>
            </View>
            <Text style={twStyle("font-semibold tabular-nums text-gray-900")}>
              {formatCurrency(Number(p.revenue ?? 0))}
            </Text>
          </View>
        ))
      )}
    </View>
  );
}
