import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import type { CalendarV2ChromeContext } from "@/features/calendar/types/calendar";

export function CalendarQuickActions({ ctx }: { ctx: CalendarV2ChromeContext }) {
  const items: {
    label: string;
    sub: string;
    icon: keyof typeof Ionicons.glyphMap;
    onPress: () => void;
    hidden?: boolean;
  }[] = [
    { label: "New", sub: "Booking", icon: "calendar-outline", onPress: ctx.onNewBooking },
    { label: "Walk-in", sub: "Queue", icon: "walk-outline", onPress: ctx.onWalkIn },
    { label: "Group", sub: "Booking", icon: "people-outline", onPress: ctx.onGroup },
    {
      label: "House call",
      sub: "Mobile",
      icon: "car-outline",
      onPress: ctx.onWalkIn,
      hidden: !ctx.offersMobileServices,
    },
    { label: "Sale", sub: "Walk-in", icon: "bag-handle-outline", onPress: ctx.onSale },
    { label: "Recurring", sub: "Series", icon: "repeat-outline", onPress: ctx.onRecurring },
    { label: "Block", sub: "Time", icon: "ban-outline", onPress: ctx.onBlock },
    { label: "Waiting", sub: "Room", icon: "hourglass-outline", onPress: ctx.onWaitingRoom },
  ];

  return (
    <View style={{ backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.gray[100], paddingVertical: 10 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}>
        {items
          .filter((i) => !i.hidden)
          .map((item) => (
            <TouchableOpacity
              key={item.label}
              onPress={item.onPress}
              activeOpacity={0.78}
              style={{
                minWidth: 104,
                minHeight: 56,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: Colors.gray[100],
                backgroundColor: item.label === "New" ? Colors.primaryLight : "#f9fafb",
                paddingHorizontal: 12,
                paddingVertical: 10,
                flexDirection: "row",
                alignItems: "center",
              }}
              accessibilityRole="button"
              accessibilityLabel={`${item.label} ${item.sub}`}
            >
              <View
                style={{
                  height: 30,
                  width: 30,
                  borderRadius: 15,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: Colors.white,
                  marginRight: 8,
                }}
              >
                <Ionicons name={item.icon} size={16} color={item.label === "New" ? Colors.primary : Colors.gray[700]} />
              </View>
              <View>
                <Text style={{ fontSize: 12, fontWeight: "800", color: Colors.gray[900] }}>{item.label}</Text>
                <Text style={{ marginTop: 1, fontSize: 10, color: Colors.gray[500] }}>{item.sub}</Text>
              </View>
            </TouchableOpacity>
          ))}
      </ScrollView>
    </View>
  );
}
