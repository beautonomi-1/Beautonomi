import { View, Text } from "react-native";
import { Colors } from "@/constants/colors";
import { formatTimeInZone } from "@/lib/format";

interface HoldBlock {
  id: string;
  start_time: string;
  end_time: string;
  hold_expires_at?: string | null;
  reason?: string | null;
}

export function CalendarHoldCard({ block, providerTimezone }: { block: HoldBlock; providerTimezone: string | null }) {
  const expiryLabel = block.hold_expires_at
    ? formatTimeInZone(block.hold_expires_at, providerTimezone)
    : null;
  return (
    <View
      style={{
        marginHorizontal: 12,
        marginBottom: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: Colors.gray[300],
        borderStyle: "dashed",
        backgroundColor: Colors.gray[50],
        minHeight: 48,
      }}
    >
      <Text style={{ fontSize: 13, fontWeight: "600", color: Colors.gray[500] }}>
        Processing hold
      </Text>
      <Text style={{ fontSize: 12, color: Colors.gray[400], marginTop: 2 }}>
        {block.start_time} – {block.end_time}
        {expiryLabel ? ` · expires ${expiryLabel}` : ""}
      </Text>
    </View>
  );
}
