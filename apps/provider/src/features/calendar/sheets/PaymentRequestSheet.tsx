import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Colors } from "@/constants/colors";
import { formatCurrency } from "@/lib/format";

interface Props {
  visible: boolean;
  bookingId: string | null;
  totalAmount?: number;
  totalPaid?: number;
  currency?: string;
  onClose: () => void;
}

export function PaymentRequestSheet({ visible, bookingId, totalAmount, totalPaid, currency = "USD", onClose }: Props) {
  const router = useRouter();
  const due = Math.max(0, (totalAmount ?? 0) - (totalPaid ?? 0));
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Payment" snapHeight="half" showHandle>
      <View style={{ paddingHorizontal: 20, paddingBottom: 32 }}>
        {due > 0 ? (
          <Text style={{ fontSize: 15, color: Colors.gray[700], marginBottom: 20 }}>
            Outstanding balance:{" "}
            <Text style={{ fontWeight: "700", color: Colors.warning }}>
              {formatCurrency(due, currency)}
            </Text>
          </Text>
        ) : null}
        <View
          style={{
            borderRadius: 12,
            borderWidth: 1,
            borderColor: Colors.gray[200],
            padding: 14,
            backgroundColor: Colors.gray[50],
            marginBottom: 16,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Ionicons name="information-circle-outline" size={18} color={Colors.gray[500]} />
            <Text style={{ marginLeft: 8, fontSize: 14, color: Colors.gray[600], flex: 1 }}>
              Payment request and mark-paid routes are verified at runtime. Open the full booking record to process payment.
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={{
            borderRadius: 12,
            paddingVertical: 14,
            backgroundColor: Colors.primary,
            alignItems: "center",
          }}
          onPress={() => {
            if (bookingId) {
              router.push(`/(app)/(tabs)/more/bookings/${bookingId}` as never);
            }
            onClose();
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: "700", color: Colors.white }}>Open Full Record</Text>
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
}
