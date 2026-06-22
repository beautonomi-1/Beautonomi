import { View, Text, type ComponentProps } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { twStyle } from "@/lib/twStyle";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

export type ProviderPaymentSummaryRow = {
  icon: IoniconName;
  label: string;
  value: string;
  valueSelectable?: boolean;
};

export function ProviderPaymentSuccessCard({
  title,
  body,
  summaryRows,
  footerHint,
}: {
  title: string;
  body: string;
  summaryRows?: ProviderPaymentSummaryRow[];
  footerHint?: string;
}) {
  return (
    <View style={twStyle("w-full max-w-sm items-center rounded-3xl border border-emerald-100 bg-white p-7 shadow-sm")}>
      <View style={twStyle("mb-5 rounded-full bg-emerald-100 p-4")}>
        <Ionicons name="checkmark-circle" size={64} color="#047857" />
      </View>
      <Text style={twStyle("text-center text-2xl font-bold text-gray-950")}>{title}</Text>
      <Text style={twStyle("mt-3 text-center text-sm leading-6 text-gray-600")}>{body}</Text>

      {summaryRows && summaryRows.length > 0 ? (
        <View style={twStyle("mt-5 w-full rounded-2xl border border-gray-100 bg-gray-50 p-4")}>
          {summaryRows.map((row, i) => (
            <View
              key={`${row.label}-${i}`}
              style={twStyle(`flex-row items-start gap-3 ${i > 0 ? "mt-3 border-t border-gray-200 pt-3" : ""}`)}
            >
              <Ionicons name={row.icon} size={16} color="#047857" style={{ marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <Text style={twStyle("text-xs font-medium uppercase tracking-wide text-gray-500")}>
                  {row.label}
                </Text>
                <Text
                  style={twStyle("mt-0.5 text-sm font-semibold text-gray-900")}
                  selectable={row.valueSelectable}
                >
                  {row.value}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      <View style={twStyle("mt-5 w-full rounded-2xl bg-emerald-50 px-4 py-3")}>
        <Text style={twStyle("text-center text-xs font-semibold uppercase tracking-wide text-emerald-700")}>
          Payment successful
        </Text>
        <Text style={twStyle("mt-1 text-center text-sm text-emerald-900")}>
          Customers can now discover your boosted listing.
        </Text>
      </View>

      {footerHint ? (
        <Text style={twStyle("mt-5 text-center text-xs text-gray-400")}>{footerHint}</Text>
      ) : null}
    </View>
  );
}
