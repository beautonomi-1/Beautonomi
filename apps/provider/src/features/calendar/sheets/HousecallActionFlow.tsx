import { View, Text, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Colors } from "@/constants/colors";
import { getHousecallNextAction } from "@/features/calendar/policies/housecallStateMachine.policy";
import { useHousecallWorkflow } from "@/features/calendar/hooks/useHousecallWorkflow";
import type { CalendarBooking } from "@/components/calendar/calendar-booking-types";

const ACTION_LABELS: Record<string, string> = {
  verify: "Verify Arrival",
  start_service: "Start Service",
  complete: "Complete Service",
  none: "No action available",
};

interface Props {
  visible: boolean;
  booking: CalendarBooking | null;
  onClose: () => void;
  onComplete?: () => void;
}

export function HousecallActionFlow({ visible, booking, onClose, onComplete }: Props) {
  const { startJourney, arrive, loading } = useHousecallWorkflow();

  if (!booking) return null;

  const nextAction = getHousecallNextAction(booking);
  const canProceed = nextAction.labelKey !== "none" && nextAction.labelKey !== "verify";
  const actionLabel = ACTION_LABELS[nextAction.labelKey] ?? nextAction.labelKey;

  const handleAction = async () => {
    if (!booking) return;
    let res: { ok: boolean; error?: string } = { ok: false, error: "Not implemented" };
    if (nextAction.labelKey === "start_service") {
      res = await arrive(booking.id);
    } else if (nextAction.labelKey === "complete") {
      res = await arrive(booking.id);
    }
    if (!res.ok) {
      Alert.alert("Could not proceed", res.error ?? "Unknown error");
    } else {
      onComplete?.();
      onClose();
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title="House Call" snapHeight="half" showHandle>
      <View style={{ paddingHorizontal: 20, paddingBottom: 32 }}>
        <Text style={{ fontSize: 16, fontWeight: "700", color: Colors.gray[900], marginBottom: 8 }}>
          Stage: {nextAction.stage.replace(/_/g, " ")}
        </Text>
        {nextAction.blockedReason ? (
          <View
            style={{
              borderRadius: 10,
              backgroundColor: "#FFF7ED",
              borderWidth: 1,
              borderColor: "#FED7AA",
              padding: 12,
              marginBottom: 20,
            }}
          >
            <Text style={{ fontSize: 14, color: "#92400E" }}>
              {nextAction.blockedReason === "verification_required"
                ? "Arrival verification required before starting service."
                : nextAction.blockedReason}
            </Text>
          </View>
        ) : null}

        {canProceed && (
          <TouchableOpacity
            style={{
              borderRadius: 12,
              paddingVertical: 14,
              backgroundColor: Colors.primary,
              alignItems: "center",
              marginBottom: 12,
            }}
            onPress={handleAction}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={{ fontSize: 16, fontWeight: "700", color: Colors.white }}>{actionLabel}</Text>
            )}
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={{
            borderRadius: 10,
            paddingVertical: 12,
            backgroundColor: Colors.gray[100],
            alignItems: "center",
          }}
          onPress={onClose}
        >
          <Text style={{ fontSize: 15, fontWeight: "600", color: Colors.gray[700] }}>Close</Text>
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
}
