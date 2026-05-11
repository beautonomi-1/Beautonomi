/**
 * Product & inventory: catalogue snapshot from products (+ product_variants), aligned with web API.
 */
import { View, Text } from "react-native";
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

const BASIS_LABELS: Record<string, string> = {
  scope: "Scope",
  quantityRule: "Quantity",
  valueRule: "Stock value",
  alertsRule: "Alerts",
  categoryRule: "By category",
  previews: "Lists",
};

export function InventoryReportView({ data }: { data: unknown }) {
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
        Facts & definitions
      </Text>

      {basis ? (
        <View style={twStyle("rounded-2xl border border-sky-100 bg-sky-50/95 px-4 py-3")}>
          <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-sky-900")}>
            What this report counts
          </Text>
          <Text style={twStyle("mt-2 text-sm leading-5 text-sky-950")}>{basis}</Text>
          {tz ? <Text style={twStyle("mt-2 text-xs text-sky-900/85")}>Timezone · {tz}</Text> : null}
          {asOf ? <Text style={twStyle("mt-1 text-xs text-sky-900/85")}>Generated · {asOf}</Text> : null}
        </View>
      ) : null}

      {basisEntries.length > 0 ? (
        <View style={twStyle("rounded-2xl border border-violet-100 bg-violet-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-violet-900")}>Definitions</Text>
          {basisEntries.map(([k, v]) => (
            <Text key={k} style={twStyle("mt-2 text-sm leading-5 text-violet-950")}>
              <Text style={twStyle("font-medium")}>{BASIS_LABELS[k] ?? k} · </Text>
              {v}
            </Text>
          ))}
        </View>
      ) : null}

      <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>Catalogue</Text>
      <View style={twStyle("flex-row flex-wrap gap-3")}>
        <View style={twStyle("min-w-[140px] flex-1 rounded-2xl border border-gray-100 bg-white px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-gray-600")}>Catalogue SKUs</Text>
          <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-gray-900")}>{data.totalProducts}</Text>
        </View>
        <View style={twStyle("min-w-[140px] flex-1 rounded-2xl border border-emerald-100 bg-emerald-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-emerald-900")}>Active</Text>
          <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-emerald-950")}>{data.activeProducts}</Text>
          <Text style={twStyle("mt-1 text-[11px] leading-4 text-emerald-900/85")}>is_active true</Text>
        </View>
        <View style={twStyle("min-w-[140px] flex-1 rounded-2xl border border-gray-100 bg-gray-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-gray-700")}>Inactive</Text>
          <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-gray-900")}>{data.inactiveProducts}</Text>
          <Text style={twStyle("mt-1 text-[11px] leading-4 text-gray-600")}>is_active not true</Text>
        </View>
        <View style={twStyle("min-w-[140px] flex-1 rounded-2xl border border-indigo-100 bg-indigo-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-indigo-900")}>Tracking stock</Text>
          <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-indigo-950")}>{tracking}</Text>
          <Text style={twStyle("mt-1 text-[11px] leading-4 text-indigo-900/85")}>track not false</Text>
        </View>
      </View>

      <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>Value & alerts</Text>
      <View style={twStyle("flex-row flex-wrap gap-3")}>
        <View style={twStyle("min-w-[160px] flex-1 rounded-2xl border border-emerald-100 bg-emerald-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-emerald-900")}>Retail stock value</Text>
          <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-emerald-950")}>
            {formatCurrency(data.totalStockValue)}
          </Text>
          <Text style={twStyle("mt-1 text-[11px] leading-4 text-emerald-900/85")}>
            Untracked SKUs contribute 0 to this sum.
          </Text>
        </View>
        <View style={twStyle("min-w-[140px] flex-1 rounded-2xl border border-amber-100 bg-amber-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-amber-900")}>Low stock</Text>
          <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-amber-950")}>{lowN}</Text>
          <Text style={twStyle("mt-1 text-[11px] leading-4 text-amber-900/85")}>
            Preview up to {limLow} · full count {lowN}
          </Text>
        </View>
        <View style={twStyle("min-w-[140px] flex-1 rounded-2xl border border-red-100 bg-red-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-red-900")}>Out of stock</Text>
          <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-red-950")}>{outN}</Text>
          <Text style={twStyle("mt-1 text-[11px] leading-4 text-red-900/85")}>
            Preview up to {limOut} · full count {outN}
          </Text>
        </View>
      </View>

      {(data.lowStockProducts ?? []).length > 0 ? (
        <>
          <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-amber-900")}>
            Low stock (preview)
          </Text>
          <Text style={twStyle("text-xs leading-5 text-amber-950/90")}>
            Tracked products with quantity between 1 and low_stock_level (default 5).
          </Text>
          {(data.lowStockProducts ?? []).map((p) => (
            <View
              key={String(p.id ?? p.name)}
              style={twStyle(
                "rounded-2xl border border-amber-200/90 bg-white px-4 py-3",
              )}
            >
              <Text style={twStyle("font-medium text-gray-900")}>{p.name ?? "Product"}</Text>
              <Text style={twStyle("text-xs text-gray-600 mt-0.5")}>{p.category ?? "Uncategorized"}</Text>
              {p.has_variants ? (
                <Text style={twStyle("text-xs text-gray-500 mt-0.5")}>Has variants</Text>
              ) : null}
              <View style={twStyle("mt-2 flex-row flex-wrap justify-between gap-2")}>
                <Text style={twStyle("text-sm font-semibold tabular-nums text-amber-900")}>
                  {Number(p.stock_quantity ?? 0)} on hand
                </Text>
                <Text style={twStyle("text-xs text-gray-600")}>
                  From {formatCurrency(Number(p.price ?? 0))}
                  {typeof p.retail_line_value === "number"
                    ? ` · line ${formatCurrency(p.retail_line_value)}`
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
            Out of stock (preview)
          </Text>
          <Text style={twStyle("text-xs leading-5 text-red-950/90")}>Tracked products with effective quantity 0.</Text>
          {(data.outOfStockProducts ?? []).map((p) => (
            <View
              key={String(p.id ?? p.name)}
              style={twStyle("rounded-2xl border border-red-200/90 bg-white px-4 py-3")}
            >
              <Text style={twStyle("font-medium text-gray-900")}>{p.name ?? "Product"}</Text>
              <Text style={twStyle("text-xs text-gray-600 mt-0.5")}>{p.category ?? "Uncategorized"}</Text>
              <View style={twStyle("mt-2 flex-row flex-wrap justify-between gap-2")}>
                <Text style={twStyle("text-sm font-semibold tabular-nums text-red-800")}>0 on hand</Text>
                <Text style={twStyle("text-xs text-gray-600")}>
                  From {formatCurrency(Number(p.price ?? 0))}
                </Text>
              </View>
            </View>
          ))}
        </>
      ) : null}

      <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>
        Retail value by category
      </Text>
      <Text style={twStyle("text-xs leading-5 text-gray-600 mb-1")}>
        Count = products in category; value sums retail stock value (untracked adds 0).
      </Text>
      {(data.categoryBreakdown ?? []).map((c) => (
        <View
          key={c.category}
          style={twStyle("flex-row items-center justify-between rounded-2xl border border-gray-100 bg-white px-4 py-3")}
        >
          <View>
            <Text style={twStyle("font-medium text-gray-900")}>{c.category}</Text>
            <Text style={twStyle("text-xs text-gray-500")}>{c.count} products</Text>
          </View>
          <Text style={twStyle("font-semibold tabular-nums text-gray-900")}>{formatCurrency(c.stockValue)}</Text>
        </View>
      ))}
    </View>
  );
}
