import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { twStyle } from "@/lib/twStyle";

type Props = {
  basisNote?: string | null;
  reportBasis?: string | null;
  compact?: boolean;
};

/** Shows API `basisNote` / `reportBasis` so providers know what a metric means. */
export function ReportBasisFootnote({ basisNote, reportBasis, compact }: Props) {
  const text = (basisNote || reportBasis || "").trim();
  if (!text) return null;

  return (
    <View
      style={twStyle(
        `mb-3 flex-row rounded-xl border border-sky-200 bg-sky-50 ${compact ? "px-3 py-2" : "px-3 py-3"}`,
      )}
    >
      <Ionicons name="information-circle-outline" size={compact ? 18 : 20} color="#0369a1" style={{ marginTop: 1 }} />
      <Text style={twStyle(`ml-2 flex-1 text-sky-950 ${compact ? "text-xs leading-4" : "text-sm leading-5"}`)}>
        {text}
      </Text>
    </View>
  );
}
