import { View, Text, TouchableOpacity } from "react-native";
import { twStyle } from "@/lib/twStyle";

export type MoneyRangeKey = "today" | "week" | "month" | "year" | "all";

export const MONEY_RANGE_OPTIONS: { value: MoneyRangeKey; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "year", label: "This year" },
  { value: "all", label: "All time" },
];

export function moneyRangeCaption(range: MoneyRangeKey): string {
  switch (range) {
    case "today":
      return "Today";
    case "week":
      return "This week (Mon–today)";
    case "month":
      return "This month";
    case "year":
      return "This year";
    case "all":
      return "All time";
    default:
      return "This month";
  }
}

interface MoneyRangeChipsProps {
  value: MoneyRangeKey;
  onChange: (value: MoneyRangeKey) => void;
}

export function MoneyRangeChips({ value, onChange }: MoneyRangeChipsProps) {
  return (
    <View style={twStyle("mb-3 flex-row flex-wrap px-4")}>
      {MONEY_RANGE_OPTIONS.map((opt) => (
        <TouchableOpacity
          key={opt.value}
          onPress={() => onChange(opt.value)}
          accessibilityLabel={moneyRangeCaption(opt.value)}
          style={[
            twStyle(`rounded-full px-3.5 py-2 ${value === opt.value ? "bg-emerald-600" : "bg-gray-100"}`),
            { marginRight: 8, marginBottom: 8 },
          ]}
        >
          <Text
            style={twStyle(`text-sm font-medium ${value === opt.value ? "text-white" : "text-gray-700"}`)}
          >
            {opt.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}
