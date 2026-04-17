/**
 * Renders JSON report payloads with clear sections (same data as web reports).
 */
import { View, Text, ScrollView } from "react-native";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { formatCurrency } from "@/lib/format";
import { twStyle } from "@/lib/twStyle";

function isMoneyKey(k: string): boolean {
  const l = k.toLowerCase();
  return (
    l.includes("revenue") ||
    l.includes("amount") ||
    (l.includes("total") && (l.includes("fee") || l.includes("pay") || l.includes("refund"))) ||
    l.includes("price") ||
    l.includes("value") ||
    l.includes("balance") ||
    l.includes("payout") ||
    l.includes("cost") ||
    l.includes("ltv")
  );
}

function formatPrimitive(key: string, val: unknown): string {
  if (val == null) return "—";
  if (typeof val === "boolean") return val ? "Yes" : "No";
  if (typeof val === "number") {
    if (Number.isFinite(val) && isMoneyKey(key) && Math.abs(val) > 0.5) {
      return formatCurrency(val);
    }
    return String(val);
  }
  if (typeof val === "string") return val;
  return JSON.stringify(val);
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={twStyle("flex-row justify-between border-b border-gray-100 py-3")}>
      <Text style={twStyle("mr-3 flex-1 text-sm text-gray-600")}>{label}</Text>
      <Text style={twStyle("max-w-[58%] text-right text-sm font-medium text-gray-900")} numberOfLines={12}>
        {value}
      </Text>
    </View>
  );
}

export function ReportPayloadView({ data, title }: { data: unknown; title?: string }) {
  if (data == null) {
    return <Text style={twStyle("py-6 text-center text-sm text-gray-500")}>No data</Text>;
  }

  if (typeof data !== "object") {
    return <Text style={twStyle("text-base text-gray-900")}>{String(data)}</Text>;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      return <Text style={twStyle("py-4 text-sm text-gray-500")}>No rows</Text>;
    }
    const first = data[0];
    if (first != null && typeof first === "object" && !Array.isArray(first)) {
      const keys = Object.keys(first as object);
      return (
        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View>
            <View style={twStyle("flex-row border-b border-gray-200 bg-gray-50 py-2")}>
              {keys.map((k) => (
                <Text key={k} style={twStyle("w-28 px-2 text-xs font-semibold text-gray-700")} numberOfLines={2}>
                  {k}
                </Text>
              ))}
            </View>
            {data.slice(0, 100).map((row, i) => (
              <View key={i} style={twStyle("flex-row border-b border-gray-100 py-2")}>
                {keys.map((k) => (
                  <Text key={k} style={twStyle("w-28 px-2 text-xs text-gray-800")} numberOfLines={6}>
                    {formatPrimitive(k, (row as Record<string, unknown>)[k])}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      );
    }
    return (
      <View>
        {data.slice(0, 50).map((item, i) => (
          <Text key={i} style={twStyle("border-b border-gray-100 py-2 text-sm text-gray-800")}>
            {typeof item === "object" ? JSON.stringify(item) : String(item)}
          </Text>
        ))}
      </View>
    );
  }

  const obj = data as Record<string, unknown>;
  const entries = Object.entries(obj).filter(([, v]) => v !== undefined);
  const scalarEntries = entries.filter(
    ([, v]) => v == null || typeof v === "string" || typeof v === "number" || typeof v === "boolean",
  );
  const nestedEntries = entries.filter(
    ([, v]) => v != null && typeof v === "object",
  );

  return (
    <View>
      {title ? <Text style={twStyle("mb-3 text-xs font-semibold uppercase text-gray-500")}>{title}</Text> : null}
      {scalarEntries.length > 0 ? (
        <View style={twStyle("mb-4 rounded-2xl border border-gray-100 bg-white px-3")}>
          {scalarEntries.map(([k, v]) => (
            <Row key={k} label={k.replace(/_/g, " ")} value={formatPrimitive(k, v)} />
          ))}
        </View>
      ) : null}
      {nestedEntries.map(([k, v]) => (
        <View key={k} style={twStyle("mb-4")}>
          <SectionHeader title={k.replace(/_/g, " ")} />
          <ReportPayloadView data={v} />
        </View>
      ))}
    </View>
  );
}
