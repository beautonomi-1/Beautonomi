/**
 * Top products by aggregated line revenue — same rules as GET …/products/top.
 */
import { useCallback } from "react";
import { View, Text } from "react-native";
import { useTranslation } from "@beautonomi/i18n";
import { ReportPayloadView } from "@/features/reports/ReportPayloadView";
import { formatCurrency } from "@/lib/format";
import { twStyle } from "@/lib/twStyle";

type Row = {
  productId?: string;
  productName?: string;
  category?: string;
  totalQuantity?: number;
  totalRevenue?: number;
  averagePrice?: number;
  timesSold?: number;
};

function isTopProductsPayload(data: unknown): data is {
  reportBasis?: string;
  timezone?: string;
  fromYmd?: string;
  toYmd?: string;
  limit?: number;
  basis?: Record<string, string>;
  topProducts: Row[];
  totalProductsSold: number;
  totalRevenue: number;
} {
  return (
    data != null &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    Array.isArray((data as { topProducts?: unknown }).topProducts) &&
    typeof (data as { totalRevenue?: unknown }).totalRevenue === "number"
  );
}

const BASIS_KEYS: Record<string, string> = {
  bookingLines: "basisBookingLines",
  orderLines: "basisOrderLines",
  revenue: "basisRevenue",
  ranking: "basisRanking",
  timesSold: "basisTimesSold",
  averages: "basisAverages",
};

export function TopProductsReportView({ data }: { data: unknown }) {
  const { t } = useTranslation();
  const tp = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t("provider.mobile.screens.topProductsReport." + key, opts) as string,
    [t],
  );

  if (!isTopProductsPayload(data)) {
    return <ReportPayloadView data={data} />;
  }

  const basis = typeof data.reportBasis === "string" ? data.reportBasis : "";
  const tz = typeof data.timezone === "string" ? data.timezone : "";
  const period =
    typeof data.fromYmd === "string" && typeof data.toYmd === "string"
      ? `${data.fromYmd} – ${data.toYmd}`
      : "";
  const lim = typeof data.limit === "number" ? data.limit : data.topProducts.length;

  const basisEntries = data.basis
    ? Object.entries(data.basis).filter(([, v]) => typeof v === "string" && String(v).trim())
    : [];

  return (
    <View style={twStyle("gap-5 pb-8")}>
      <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>
        {tp("factsDefinitions")}
      </Text>

      {basis ? (
        <View style={twStyle("rounded-2xl border border-sky-100 bg-sky-50/95 px-4 py-3")}>
          <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-sky-900")}>
            {tp("whatThisCounts")}
          </Text>
          <Text style={twStyle("mt-2 text-sm leading-5 text-sky-950")}>{basis}</Text>
          <View style={twStyle("mt-2 gap-1")}>
            {tz ? <Text style={twStyle("text-xs text-sky-900/85")}>{tp("timezone", { tz })}</Text> : null}
            {period ? <Text style={twStyle("text-xs text-sky-900/85")}>{tp("window", { period })}</Text> : null}
            <Text style={twStyle("text-xs text-sky-900/85")}>{tp("listCap", { limit: lim })}</Text>
          </View>
        </View>
      ) : null}

      {basisEntries.length > 0 ? (
        <View style={twStyle("rounded-2xl border border-violet-100 bg-violet-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-violet-900")}>{tp("definitions")}</Text>
          {basisEntries.map(([k, v]) => (
            <Text key={k} style={twStyle("mt-2 text-sm leading-5 text-violet-950")}>
              <Text style={twStyle("font-medium")}>
                {tp("definitionLabel", { label: BASIS_KEYS[k] ? tp(BASIS_KEYS[k]) : k })}
              </Text>
              {v}
            </Text>
          ))}
        </View>
      ) : null}

      <View style={twStyle("flex-row flex-wrap gap-3")}>
        <View style={twStyle("min-w-[140px] flex-1 rounded-2xl border border-gray-100 bg-white px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-gray-600")}>{tp("unitsWindow")}</Text>
          <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-gray-900")}>
            {data.totalProductsSold}
          </Text>
          <Text style={twStyle("mt-1 text-[11px] leading-4 text-gray-500")}>{tp("allSkusWithLines")}</Text>
        </View>
        <View style={twStyle("min-w-[140px] flex-1 rounded-2xl border border-emerald-100 bg-emerald-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-emerald-900")}>{tp("lineRevenueWindow")}</Text>
          <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-emerald-950")}>
            {formatCurrency(data.totalRevenue)}
          </Text>
          <Text style={twStyle("mt-1 text-[11px] leading-4 text-emerald-900/85")}>{tp("sumOfLineAmounts")}</Text>
        </View>
      </View>

      <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>{tp("ranking")}</Text>
      <Text style={twStyle("text-xs leading-5 text-gray-600")}>
        {tp("rankingHint")}
      </Text>

      {(data.topProducts ?? []).map((product, index) => (
        <View
          key={String(product.productId ?? index)}
          style={twStyle(
            "rounded-2xl border border-gray-100 bg-white px-4 py-3",
          )}
        >
          <View style={twStyle("flex-row items-start justify-between gap-3")}>
            <View style={twStyle("flex-row items-start gap-3 flex-1 min-w-0")}>
              <View
                style={twStyle(
                  "h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FF0077]",
                )}
              >
                <Text style={twStyle("text-xs font-bold text-white")}>{index + 1}</Text>
              </View>
              <View style={twStyle("flex-1 min-w-0")}>
                <Text style={twStyle("font-medium text-gray-900")} numberOfLines={2}>
                  {product.productName ?? tp("productFallback")}
                </Text>
                <Text style={twStyle("text-xs text-gray-600 capitalize mt-0.5")}>
                  {product.category ?? tp("uncategorized")}
                </Text>
              </View>
            </View>
            <View style={twStyle("items-end shrink-0")}>
              <Text style={twStyle("text-base font-semibold tabular-nums text-gray-900")}>
                {formatCurrency(Number(product.totalRevenue ?? 0))}
              </Text>
            </View>
          </View>
          <Text style={twStyle("mt-2 text-xs text-gray-600 ps-12")}>
            {tp("unitsAvg", {
              units: Number(product.totalQuantity ?? 0),
              avg: formatCurrency(Number(product.averagePrice ?? 0)),
            })}
          </Text>
          <Text style={twStyle("mt-1 text-xs text-gray-500 ps-12")}>
            {tp("lineRows", { count: Number(product.timesSold ?? 0) })}
          </Text>
        </View>
      ))}
    </View>
  );
}
