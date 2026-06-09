/**
 * Product sales: retail lines from appointment add-ons + paid product orders (mixed date bases).
 */
import { View, Text } from "react-native";
import { ReportPayloadView } from "@/features/reports/ReportPayloadView";
import { formatCurrency } from "@/lib/format";
import { twStyle } from "@/lib/twStyle";

type TopProduct = {
  productId?: string;
  productName?: string;
  quantitySold?: number;
  revenue?: number;
  cost?: number;
  profit?: number;
  averagePrice?: number;
};

type CategoryRow = {
  category?: string;
  quantitySold?: number;
  revenue?: number;
  profit?: number;
};

/** Distinctive shape for GET …/products/sales */
function isProductSalesPayload(data: unknown): data is {
  reportBasis?: string;
  timezone?: string;
  fromYmd?: string;
  toYmd?: string;
  basis?: Record<string, string>;
  totalProductsSold: number;
  totalRevenue: number;
  totalCost?: number;
  totalProfit?: number;
  averageRevenuePerUnitSold?: number;
  averageProductValue?: number;
  unitsFromBookings?: number;
  revenueFromBookings?: number;
  costFromBookings?: number;
  unitsFromOrders?: number;
  revenueFromOrders?: number;
  costFromOrders?: number;
  by_channel?: {
    online?: { source?: string; units?: number; revenue?: number };
    walk_in?: { source?: string; units?: number; revenue?: number };
  };
  topProducts?: TopProduct[];
  productsByCategory?: CategoryRow[];
} {
  return (
    data != null &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    typeof (data as { totalProductsSold?: unknown }).totalProductsSold === "number" &&
    typeof (data as { totalRevenue?: unknown }).totalRevenue === "number"
  );
}

const BASIS_LABELS: Record<string, string> = {
  bookingLines: "Appointment add-ons",
  orderLines: "Retail orders",
  profit: "Profit",
  topProducts: "Top products",
  averageRevenuePerUnit: "Avg revenue per unit",
};

export function ProductSalesReportView({ data }: { data: unknown }) {
  if (!isProductSalesPayload(data)) {
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

  const avgPerUnit =
    typeof data.averageRevenuePerUnitSold === "number"
      ? data.averageRevenuePerUnitSold
      : Number(data.averageProductValue ?? 0);

  const totalCost = Number(data.totalCost ?? 0);
  const totalProfit =
    typeof data.totalProfit === "number" ? data.totalProfit : Number(data.totalRevenue) - totalCost;

  return (
    <View style={twStyle("gap-5 pb-8")}>
      <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>
        Facts & definitions
      </Text>

      {basisText ? (
        <View style={twStyle("rounded-2xl border border-sky-100 bg-sky-50/95 px-4 py-3")}>
          <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-sky-900")}>
            What this report counts
          </Text>
          <Text style={twStyle("mt-2 text-sm leading-5 text-sky-950")}>{basisText}</Text>
          <View style={twStyle("mt-2 gap-1")}>
            {tz ? (
              <Text style={twStyle("text-xs text-sky-900/85")}>Timezone · {tz}</Text>
            ) : null}
            {period ? (
              <Text style={twStyle("text-xs text-sky-900/85")}>Calendar window · {period}</Text>
            ) : null}
          </View>
        </View>
      ) : null}

      {basisEntries.length > 0 ? (
        <View style={twStyle("rounded-2xl border border-violet-100 bg-violet-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-violet-900")}>
            Definitions
          </Text>
          {basisEntries.map(([k, v]) => (
            <Text key={k} style={twStyle("mt-2 text-sm leading-5 text-violet-950")}>
              <Text style={twStyle("font-medium")}>{BASIS_LABELS[k] ?? k} · </Text>
              {v}
            </Text>
          ))}
        </View>
      ) : null}

      <View style={twStyle("flex-row flex-wrap gap-3")}>
        <View style={twStyle("min-w-[140px] flex-1 rounded-2xl border border-gray-100 bg-white px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-gray-600")}>Units sold</Text>
          <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-gray-900")}>
            {data.totalProductsSold}
          </Text>
        </View>
        <View style={twStyle("min-w-[140px] flex-1 rounded-2xl border border-emerald-100 bg-emerald-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-emerald-900")}>Total revenue</Text>
          <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-emerald-950")}>
            {formatCurrency(data.totalRevenue)}
          </Text>
        </View>
      </View>

      <View style={twStyle("flex-row flex-wrap gap-3")}>
        <View style={twStyle("min-w-[140px] flex-1 rounded-2xl border border-indigo-100 bg-indigo-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-indigo-900")}>Total profit</Text>
          <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-indigo-950")}>
            {formatCurrency(totalProfit)}
          </Text>
          <Text style={twStyle("mt-1 text-[11px] leading-4 text-indigo-900/90")}>
            Revenue minus Σ(supply_price × qty) where supply_price exists.
          </Text>
        </View>
        <View style={twStyle("min-w-[140px] flex-1 rounded-2xl border border-slate-100 bg-slate-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-slate-900")}>Avg revenue / unit</Text>
          <Text style={twStyle("mt-1 text-xl font-semibold tabular-nums text-slate-950")}>
            {formatCurrency(avgPerUnit)}
          </Text>
          <Text style={twStyle("mt-1 text-[11px] leading-4 text-slate-800/90")}>
            Total revenue ÷ total units (not per SKU).
          </Text>
        </View>
      </View>

      {(typeof data.unitsFromBookings === "number" || typeof data.unitsFromOrders === "number") && (
        <>
          <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>
            By source (mixed dates)
          </Text>
          <View style={twStyle("flex-row flex-wrap gap-3")}>
            <View style={twStyle("min-w-[140px] flex-1 rounded-2xl border border-amber-100 bg-amber-50/85 px-4 py-3")}>
              <Text style={twStyle("text-xs font-medium text-amber-950")}>Appointment add-ons</Text>
              <Text style={twStyle("mt-1 text-xs leading-4 text-amber-950/85")}>
                Window on bookings.scheduled_at
              </Text>
              <Text style={twStyle("mt-2 text-lg font-semibold tabular-nums text-amber-950")}>
                {formatCurrency(Number(data.revenueFromBookings ?? 0))}
              </Text>
              <Text style={twStyle("text-xs text-amber-950/80")}>
                {Number(data.unitsFromBookings ?? 0)} units
              </Text>
            </View>
            <View style={twStyle("min-w-[140px] flex-1 rounded-2xl border border-teal-100 bg-teal-50/85 px-4 py-3")}>
              <Text style={twStyle("text-xs font-medium text-teal-950")}>Paid retail orders</Text>
              <Text style={twStyle("mt-1 text-xs leading-4 text-teal-950/85")}>
                Window on product_orders.created_at
              </Text>
              <Text style={twStyle("mt-2 text-lg font-semibold tabular-nums text-teal-950")}>
                {formatCurrency(Number(data.revenueFromOrders ?? 0))}
              </Text>
              <Text style={twStyle("text-xs text-teal-950/80")}>
                {Number(data.unitsFromOrders ?? 0)} units
              </Text>
            </View>
          </View>
          {data.by_channel ? (
            <View style={twStyle("flex-row flex-wrap gap-3")}>
              <View style={twStyle("min-w-[140px] flex-1 rounded-2xl border border-blue-100 bg-blue-50/85 px-4 py-3")}>
                <Text style={twStyle("text-xs font-medium text-blue-950")}>Online retail</Text>
                <Text style={twStyle("mt-2 text-lg font-semibold tabular-nums text-blue-950")}>
                  {formatCurrency(Number(data.by_channel.online?.revenue ?? 0))}
                </Text>
                <Text style={twStyle("text-xs text-blue-950/80")}>
                  {Number(data.by_channel.online?.units ?? 0)} units
                </Text>
              </View>
              <View style={twStyle("min-w-[140px] flex-1 rounded-2xl border border-orange-100 bg-orange-50/85 px-4 py-3")}>
                <Text style={twStyle("text-xs font-medium text-orange-950")}>Walk-in retail</Text>
                <Text style={twStyle("mt-2 text-lg font-semibold tabular-nums text-orange-950")}>
                  {formatCurrency(Number(data.by_channel.walk_in?.revenue ?? 0))}
                </Text>
                <Text style={twStyle("text-xs text-orange-950/80")}>
                  {Number(data.by_channel.walk_in?.units ?? 0)} units
                </Text>
              </View>
            </View>
          ) : null}
        </>
      )}

      <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>Top products</Text>
      {(Array.isArray(data.topProducts) ? data.topProducts : []).slice(0, 10).map((p, i) => (
        <View
          key={`${p.productId ?? p.productName ?? i}`}
          style={twStyle(
            "flex-row items-center justify-between rounded-2xl border border-gray-100 bg-white px-4 py-3",
          )}
        >
          <View style={twStyle("flex-1 pr-3")}>
            <View style={twStyle("flex-row items-center gap-2")}>
              <View
                style={twStyle(
                  "h-8 w-8 items-center justify-center rounded-full bg-[#FF0077]",
                )}
              >
                <Text style={twStyle("text-xs font-bold text-white")}>{i + 1}</Text>
              </View>
              <Text style={twStyle("flex-1 font-medium text-gray-900")} numberOfLines={2}>
                {p.productName ?? "Product"}
              </Text>
            </View>
            <Text style={twStyle("mt-1 pl-10 text-xs text-gray-500")}>
              {Number(p.quantitySold ?? 0)} sold
              {typeof p.averagePrice === "number" ? ` · avg ${formatCurrency(p.averagePrice)}` : ""}
            </Text>
          </View>
          <View style={twStyle("items-end")}>
            <Text style={twStyle("font-semibold tabular-nums text-gray-900")}>
              {formatCurrency(Number(p.revenue ?? 0))}
            </Text>
            {p.profit != null ? (
              <Text style={twStyle("text-xs text-gray-500")}>
                Profit {formatCurrency(Number(p.profit))}
              </Text>
            ) : null}
          </View>
        </View>
      ))}

      {(data.productsByCategory ?? []).length > 0 ? (
        <>
          <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>
            By category
          </Text>
          {(data.productsByCategory ?? []).map((c) => (
            <View
              key={String(c.category)}
              style={twStyle(
                "flex-row items-center justify-between rounded-2xl border border-gray-100 bg-gray-50/90 px-4 py-3",
              )}
            >
              <View>
                <Text style={twStyle("font-medium capitalize text-gray-900")}>
                  {c.category || "Uncategorized"}
                </Text>
                <Text style={twStyle("text-xs text-gray-500")}>{Number(c.quantitySold ?? 0)} sold</Text>
              </View>
              <View style={twStyle("items-end")}>
                <Text style={twStyle("font-semibold tabular-nums text-gray-900")}>
                  {formatCurrency(Number(c.revenue ?? 0))}
                </Text>
                {c.profit != null ? (
                  <Text style={twStyle("text-xs text-gray-500")}>
                    Profit {formatCurrency(Number(c.profit))}
                  </Text>
                ) : null}
              </View>
            </View>
          ))}
        </>
      ) : null}
    </View>
  );
}
