import { Modal, Text, View } from "react-native";
import Animated, { SharedValue, useAnimatedStyle } from "react-native-reanimated";
import type { CalendarBooking } from "@/components/calendar/calendar-booking-types";
import { Colors } from "@/constants/colors";
import { formatTimeInZone } from "@/lib/format";

export function CalendarDragGhost({
  dragPositionX,
  dragPositionY,
  width,
  draggingBooking,
  walkInLabel,
  providerTimezone,
}: {
  dragPositionX: SharedValue<number>;
  dragPositionY: SharedValue<number>;
  width: number;
  draggingBooking: CalendarBooking;
  walkInLabel: string;
  providerTimezone: string | null;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    return {
      left: dragPositionX.value,
      top: dragPositionY.value,
    };
  });

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent>
      <View style={{ flex: 1, pointerEvents: "none" }}>
        <Animated.View
          style={[
            {
              position: "absolute",
              width: Math.min(width - 8, 200),
              minHeight: 44,
              borderRadius: 8,
              paddingHorizontal: 6,
              paddingVertical: 4,
              borderLeftWidth: 3,
              backgroundColor: "#fff",
              borderLeftColor: "#6366f1",
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.25,
              shadowRadius: 8,
              elevation: 8,
            },
            animatedStyle,
          ]}
        >
          <Text style={{ fontSize: 10, fontWeight: "700", color: Colors.gray[900] }} numberOfLines={1}>
            {draggingBooking.customers?.full_name ?? walkInLabel}
          </Text>
          {draggingBooking.services?.length > 0 && (
            <Text style={{ marginTop: 2, fontSize: 9, color: Colors.gray[600] }} numberOfLines={1}>
              {draggingBooking.services.map((s) => s.name).join(", ")}
            </Text>
          )}
          <Text style={{ marginTop: 2, fontSize: 9, color: Colors.gray[500] }}>
            {formatTimeInZone(draggingBooking.scheduled_at, providerTimezone)}
          </Text>
        </Animated.View>
      </View>
    </Modal>
  );
}
