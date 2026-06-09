import { View, Text } from "react-native";
import { REVENUE_GLOSSARY } from "@/lib/revenue-glossary";
import { twStyle } from "@/lib/twStyle";

/** Compact glossary strip for report/dashboard screens. */
export function ReportRevenueGlossary({ keys }: { keys: (keyof typeof REVENUE_GLOSSARY)[] }) {
  return (
    <View style={twStyle("mb-4 gap-2 rounded-2xl border border-violet-100 bg-violet-50/90 px-4 py-3")}>
      <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-violet-900")}>
        What these numbers mean
      </Text>
      {keys.map((key) => {
        const row = REVENUE_GLOSSARY[key];
        return (
          <Text key={key} style={twStyle("text-xs leading-5 text-violet-950")}>
            <Text style={twStyle("font-semibold")}>{row.label}</Text>
            {" — "}
            {row.definition}
          </Text>
        );
      })}
    </View>
  );
}
