/**
 * Product & inventory: catalogue snapshot from products (+ product_variants), aligned with web API.
 */
import { View, Text } from "react-native";
import { useTranslation } from "@beautonomi/i18n";
import { ReportPayloadView } from "@/features/reports/ReportPayloadView";
import { formatCurrency } from "@/lib/format";
import { twStyle } from "@/lib/twStyle";
import { format } from "date-fns";

type PreviewProduct = {
  id?: string;
  name?: string;
  category?: string | null;
  stock_quantity?: number;
  price?: number;
  retail_line_value?: number;
  has_variants?: boolean;
  track_stock_quantity?: boolean | null;
};

function isInventoryPayload(data: unknown): data is {
  totalProducts: number;
  activeProducts: number;
  inactiveProducts: number;
  productsTrackingStock?: number;
  totalStockValue: number;
  lowStockCount?: number;
  outOfStockCount?: number;
  previewLimits?: { lowStock?: number; outOfStock?: number };
  lowStockProducts: PreviewProduct[];
  outOfStockProducts: PreviewProduct[];
  categoryBreakdown: { category: string; count: number; stockValue: number }[];
  reportBasis?: string;
  timezone?: string;
  asOf?: string;
  basis?: Record<string, string>;
} {
  return data != null && typeof data === "object" && !Array.isArray(data) && "totalProducts" in data;
}

const BASIS_LABEL_KEYS: Record<string, string> = {
  scope: "basisScope",
  quantityRule: "basisQuantity",
  valueRule: "basisStockValue",
  alertsRule: "basisAlerts",
  categoryRule: "basisCategory",
  previews: "basisPreviews",
};

export function InventoryReportView({ data }: { data: unknown }) {
  const { t } = useTranslation();
  const ir = (key: string, opts?: Record<string, unknown>) =>
    t(`provider.mobile.screens.inventoryReport.${key}`, opts) as string;

  if (!isInventoryPayload(data)) {
    return <ReportPayloadView data={data} />;
  }

  const basis = typeof data.reportBasis === "string" ? data.reportBasis : "";
  const tz = typeof data.timezone === "string" ? data.timezone : "";
  const asOf =
    typeof data.asOf === "string"
      ? format(new Date(data.asOf), "MMM d, yyyy HH:mm")
      : "";

  const basisEntries = data.basis
    ? Object.entries(data.basis).filter(([, v]) => typeof v === "string" && String(v).trim())
    : [];

  const tracking = data.productsTrackingStock ?? 0;
  const lowN = data.lowStockCount ?? data.lowStockProducts.length;
  const outN = data.outOfStockCount ?? data.outOfStockProducts.length;
  const limLow = data.previewLimits?.lowStock ?? data.lowStockProducts.length;
  const limOut = data.previewLimits?.outOfStock ?? data.outOfStockProducts.length;

  return (
    <View style={twStyle("gap-5 pb-8")}>
      <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>
        {ir("factsDefinitions")}
      </Text>

      {basis ? (
        <View style={twStyle("rounded-2xl border border-sky-100 bg-sky-50/95 px-4 py-3")}>
          <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-sky-900")}>
            {ir("whatThisCounts")}
          </Text>
          <Text style={twStyle("mt-2 text-sm leading-5 text-sky-950")}>{basis}</Text>
          {tz ? <Text style={twStyle("mt-2 text-xs text-sky-900/85")}>{ir("timezone", { tz })}</Text> : null}
          {asOf ? <Text style={twStyle("mt-1 text-xs text-sky-900/85")}>{ir("generated", { asOf })}</Text> : null}
        </View>
      ) : null}

      {basisEntries.length > 0 ? (
        <View style={twStyle("rounded-2xl border border-violet-100 bg-violet-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-violet-900")}>{ir("definitions")}</Text>
          {basisEntries.map(([k, v]) => (
            <Text key={k} style={twStyle("mt-2 text-sm leading-5 text-violet-950")}>
              <Text style={twStyle("font-medium")}>
                {ir("basisItem", { label: BASIS_LABEL_KEYS[k] ? ir(BASIS_LABEL_KEYS[k]) : k })}
              </Text>
              {v}
            </Text>
          ))}
        </View>
      ) : null}

      <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>{ir("catalogue")}</Text>
      <View style={twStyle("flex-row flex-wrap gap-3")}>
        <View style={twStyle("min-w-[140px] flex-1 rounded-2xl border border-gray-100 bg-white px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-gray-600")}>{ir("catalogueSkus")}</Text>
          <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-gray-900")}>{data.totalProducts}</Text>
        </View>
        <View style={twStyle("min-w-[140px] flex-1 rounded-2xl border border-emerald-100 bg-emerald-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-emerald-900")}>{ir("active")}</Text>
          <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-emerald-950")}>{data.activeProducts}</Text>
          <Text style={twStyle("mt-1 text-[11px] leading-4 text-emerald-900/85")}>{ir("isActiveTrue")}</Text>
        </View>
        <View style={twStyle("min-w-[140px] flex-1 rounded-2xl border border-gray-100 bg-gray-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-gray-700")}>{ir("inactive")}</Text>
          <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-gray-900")}>{data.inactiveProducts}</Text>
          <Text style={twStyle("mt-1 text-[11px] leading-4 text-gray-600")}>{ir("isActiveNotTrue")}</Text>
        </View>
        <View style={twStyle("min-w-[140px] flex-1 rounded-2xl border border-indigo-100 bg-indigo-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-indigo-900")}>{ir("trackingStock")}</Text>
          <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-indigo-950")}>{tracking}</Text>
          <Text style={twStyle("mt-1 text-[11px] leading-4 text-indigo-900/85")}>{ir("trackNotFalse")}</Text>
        </View>
      </View>

      <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>{ir("valueAndAlerts")}</Text>
      <View style={twStyle("flex-row flex-wrap gap-3")}>
        <View style={twStyle("min-w-[160px] flex-1 rounded-2xl border border-emerald-100 bg-emerald-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-emerald-900")}>{ir("retailStockValue")}</Text>
          <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-emerald-950")}>
            {formatCurrency(data.totalStockValue)}
          </Text>
          <Text style={twStyle("mt-1 text-[11px] leading-4 text-emerald-900/85")}>
            {ir("untrackedContributeZero")}
          </Text>
        </View>
        <View style={twStyle("min-w-[140px] flex-1 rounded-2xl border border-amber-100 bg-amber-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-amber-900")}>{ir("lowStock")}</Text>
          <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-amber-950")}>{lowN}</Text>
          <Text style={twStyle("mt-1 text-[11px] leading-4 text-amber-900/85")}>
            {ir("previewUpTo", { limit: limLow, count: lowN })}
          </Text>
        </View>
        <View style={twStyle("min-w-[140px] flex-1 rounded-2xl border border-red-100 bg-red-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-red-900")}>{ir("outOfStock")}</Text>
          <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-red-950")}>{outN}</Text>
          <Text style={twStyle("mt-1 text-[11px] leading-4 text-red-900/85")}>
            {ir("previewUpTo", { limit: limOut, count: outN })}
          </Text>
        </View>
      </View>

      {(data.lowStockProducts ?? []).length > 0 ? (
        <>
          <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-amber-900")}>
            {ir("lowStockPreview")}
          </Text>
          <Text style={twStyle("text-xs leading-5 text-amber-950/90")}>
            {ir("lowStockPreviewHint")}
          </Text>
          {(data.lowStockProducts ?? []).map((p) => (
            <View
              key={String(p.id ?? p.name)}
              style={twStyle(
                "rounded-2xl border border-amber-200/90 bg-white px-4 py-3",
              )}
            >
              <Text style={twStyle("font-medium text-gray-900")}>{p.name ?? ir("productFallback")}</Text>
              <Text style={twStyle("text-xs text-gray-600 mt-0.5")}>{p.category ?? ir("uncategorized")}</Text>
              {p.has_variants ? (
                <Text style={twStyle("text-xs text-gray-500 mt-0.5")}>{ir("hasVariants")}</Text>
              ) : null}
              <View style={twStyle("mt-2 flex-row flex-wrap justify-between gap-2")}>
                <Text style={twStyle("text-sm font-semibold tabular-nums text-amber-900")}>
                  {ir("onHand", { count: Number(p.stock_quantity ?? 0) })}
                </Text>
                <Text style={twStyle("text-xs text-gray-600")}>
                  {ir("fromPrice", { amount: formatCurrency(Number(p.price ?? 0)) })}
                  {typeof p.retail_line_value === "number"
                    ? ir("lineValue", { amount: formatCurrency(p.retail_line_value) })
                    : ""}
                </Text>
              </View>
            </View>
          ))}
        </>
      ) : null}

      {(data.outOfStockProducts ?? []).length > 0 ? (
        <>
          <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-red-900")}>
            {ir("outOfStockPreview")}
          </Text>
          <Text style={twStyle("text-xs leading-5 text-red-950/90")}>{ir("outOfStockPreviewHint")}</Text>
          {(data.outOfStockProducts ?? []).map((p) => (
            <View
              key={String(p.id ?? p.name)}
              style={twStyle("rounded-2xl border border-red-200/90 bg-white px-4 py-3")}
            >
              <Text style={twStyle("font-medium text-gray-900")}>{p.name ?? ir("productFallback")}</Text>
              <Text style={twStyle("text-xs text-gray-600 mt-0.5")}>{p.category ?? ir("uncategorized")}</Text>
              <View style={twStyle("mt-2 flex-row flex-wrap justify-between gap-2")}>
                <Text style={twStyle("text-sm font-semibold tabular-nums text-red-800")}>{ir("zeroOnHand")}</Text>
                <Text style={twStyle("text-xs text-gray-600")}>
                  {ir("fromPrice", { amount: formatCurrency(Number(p.price ?? 0)) })}
                </Text>
              </View>
            </View>
          ))}
        </>
      ) : null}

      <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>
        {ir("retailValueByCategory")}
      </Text>
      <Text style={twStyle("text-xs leading-5 text-gray-600 mb-1")}>
        {ir("categoryValueHint")}
      </Text>
      {(data.categoryBreakdown ?? []).map((c) => (
        <View
          key={c.category}
          style={twStyle("flex-row items-center justify-between rounded-2xl border border-gray-100 bg-white px-4 py-3")}
        >
          <View>
            <Text style={twStyle("font-medium text-gray-900")}>{c.category}</Text>
            <Text style={twStyle("text-xs text-gray-500")}>{ir("productsCount", { count: c.count })}</Text>
          </View>
          <Text style={twStyle("font-semibold tabular-nums text-gray-900")}>{formatCurrency(c.stockValue)}</Text>
        </View>
      ))}
    </View>
  );
}
