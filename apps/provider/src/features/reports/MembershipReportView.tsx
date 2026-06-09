/**
 * Salon membership sales report — liability gross, recognized earnings, discounts.
 */
import { View, Text } from "react-native";
import { ReportPayloadView } from "@/features/reports/ReportPayloadView";
import { formatCurrency } from "@/lib/format";
import { twStyle } from "@/lib/twStyle";

function isMembershipPayload(data: unknown): data is {
  reportBasis?: string;
  gross_sales: number;
  recognized_earnings: number;
  member_discounts_applied: number;
  active_subscribers: number;
  sales_count?: number;
  sales_by_day?: { date: string; gross: number; count: number }[];
} {
  return (
    data != null &&
    typeof data === "object" &&
    typeof (data as { gross_sales?: unknown }).gross_sales === "number"
  );
}

export function MembershipReportView({ data }: { data: unknown }) {
  if (!isMembershipPayload(data)) {
    return <ReportPayloadView data={data} />;
  }

  return (
    <View style={twStyle("gap-4")}>
      {data.reportBasis ? (
        <Text style={twStyle("text-xs leading-5 text-gray-500")}>{data.reportBasis}</Text>
      ) : null}
      <View style={twStyle("flex-row flex-wrap gap-3")}>
        <View style={twStyle("min-w-[140px] flex-1 rounded-2xl border border-violet-100 bg-violet-50/85 px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-violet-950")}>Gross sales (liability)</Text>
          <Text style={twStyle("mt-2 text-xl font-semibold tabular-nums text-violet-950")}>
            {formatCurrency(data.gross_sales)}
          </Text>
          <Text style={twStyle("mt-1 text-xs text-violet-950/80")}>{data.sales_count ?? 0} sales</Text>
        </View>
        <View style={twStyle("min-w-[140px] flex-1 rounded-2xl border border-emerald-100 bg-emerald-50/85 px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-emerald-950")}>Recognized earnings</Text>
          <Text style={twStyle("mt-2 text-xl font-semibold tabular-nums text-emerald-950")}>
            {formatCurrency(data.recognized_earnings)}
          </Text>
        </View>
        <View style={twStyle("min-w-[140px] flex-1 rounded-2xl border border-amber-100 bg-amber-50/85 px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-amber-950")}>Member discounts</Text>
          <Text style={twStyle("mt-2 text-xl font-semibold tabular-nums text-amber-950")}>
            {formatCurrency(data.member_discounts_applied)}
          </Text>
        </View>
        <View style={twStyle("min-w-[140px] flex-1 rounded-2xl border border-slate-100 bg-slate-50/85 px-4 py-3")}>
          <Text style={twStyle("text-xs font-medium text-slate-900")}>Active subscribers</Text>
          <Text style={twStyle("mt-2 text-xl font-semibold tabular-nums text-slate-950")}>
            {data.active_subscribers}
          </Text>
          <Text style={twStyle("mt-1 text-xs text-slate-800/90")}>Current status=active</Text>
        </View>
      </View>
      {(data.sales_by_day?.length ?? 0) > 0 ? (
        <>
          <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-gray-500")}>Sales by day</Text>
          {data.sales_by_day!.map((row) => (
            <View
              key={row.date}
              style={twStyle("flex-row items-center justify-between rounded-xl border border-gray-100 bg-white px-4 py-3")}
            >
              <Text style={twStyle("text-sm text-gray-600")}>{row.date}</Text>
              <Text style={twStyle("text-sm font-semibold text-gray-900")}>
                {formatCurrency(row.gross)} ({row.count})
              </Text>
            </View>
          ))}
        </>
      ) : null}
    </View>
  );
}
