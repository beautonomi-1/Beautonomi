import { View, Text } from "react-native";
import { Colors } from "@/constants/colors";

/** Placeholder for revenue / utilization insights — expand with real aggregates when APIs land. */
export function CalendarInsightsPanel() {
  return (
    <View style={{ flex: 1, padding: 24, backgroundColor: Colors.white }}>
      <Text style={{ fontSize: 20, fontWeight: "700", color: Colors.gray[900] }}>Insights</Text>
      <Text style={{ marginTop: 10, fontSize: 15, lineHeight: 22, color: Colors.gray[600] }}>
        Summary charts for bookings, revenue, and utilization will appear here. Use the Schedule tab for day-to-day operations.
      </Text>
    </View>
  );
}
