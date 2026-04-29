/**
 * Renders JSON report payloads with clear sections (same data as web reports).
 */
import { View, Text, ScrollView, useWindowDimensions } from "react-native";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { formatCurrency } from "@/lib/format";
import { twStyle } from "@/lib/twStyle";

function isMoneyKey(k: string): boolean {
  const l = k.toLowerCase();
  if (
    /\b(count|counts|quantity|qty|units|hours|minutes|duration|rate|percent|percentage)\b/.test(l.replace(/_/g, " ")) ||
    /(_count|_counts|count_|counts_|_rate|_percent|_percentage)$/.test(l)
  ) {
    return false;
  }
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

function humanizeKey(k: string): string {
  return k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={twStyle("flex-row items-start justify-between border-b border-gray-100 py-3.5")}>
      <Text style={twStyle("mr-4 max-w-[48%] flex-1 text-sm leading-5 text-gray-600")}>{label}</Text>
      <Text
        style={twStyle("min-w-0 flex-1 text-right text-sm font-medium leading-5 text-gray-900")}
        numberOfLines={20}
      >
        {value}
      </Text>
    </View>
  );
}

export function ReportPayloadView({ data, title }: { data: unknown; title?: string }) {
  const { width: windowWidth } = useWindowDimensions();
  const horizontalPad = 24;
  const tableViewport = Math.max(280, windowWidth - horizontalPad);

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
      const colMin = Math.max(112, Math.min(156, Math.floor(tableViewport / Math.min(keys.length, 4))));
      const tableWidth = Math.max(tableViewport, keys.length * colMin);

      return (
        <ScrollView horizontal showsHorizontalScrollIndicator keyboardShouldPersistTaps="handled">
          <View style={{ minWidth: tableWidth, paddingBottom: 8 }}>
            <View
              style={twStyle("flex-row border-b border-gray-200 bg-gray-50 py-2.5")}
            >
              {keys.map((k) => (
                <Text
                  key={k}
                  style={[
                    twStyle("px-2 text-xs font-semibold uppercase tracking-wide text-gray-700"),
                    { width: colMin },
                  ]}
                  numberOfLines={3}
                >
                  {humanizeKey(k)}
                </Text>
              ))}
            </View>
            {data.slice(0, 200).map((row, i) => (
              <View
                key={i}
                style={twStyle(i % 2 === 0 ? "flex-row bg-white py-2.5" : "flex-row bg-gray-50/80 py-2.5")}
              >
                {keys.map((k) => (
                  <Text
                    key={k}
                    style={[
                      twStyle("px-2 text-xs leading-4 text-gray-800"),
                      { width: colMin },
                    ]}
                    numberOfLines={12}
                  >
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
          <Text key={i} style={twStyle("border-b border-gray-100 py-2.5 text-sm text-gray-800")}>
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
  const nestedEntries = entries.filter(([, v]) => v != null && typeof v === "object");

  return (
    <View>
      {title ? (
        <Text style={twStyle("mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500")}>{title}</Text>
      ) : null}
      {scalarEntries.length > 0 ? (
        <View style={twStyle("mb-4 overflow-hidden rounded-2xl border border-gray-100 bg-white px-4")}>
          {scalarEntries.map(([k, v]) => (
            <Row key={k} label={humanizeKey(k)} value={formatPrimitive(k, v)} />
          ))}
        </View>
      ) : null}
      {nestedEntries.map(([k, v]) => (
        <View key={k} style={twStyle("mb-4")}>
          <SectionHeader title={humanizeKey(k)} />
          <ReportPayloadView data={v} />
        </View>
      ))}
    </View>
  );
}
