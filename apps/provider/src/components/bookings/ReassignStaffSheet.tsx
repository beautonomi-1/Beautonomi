/**
 * Reassign staff on a booking service line (mobile parity with web).
 */
import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "@/hooks/useApi";
import { api } from "@/lib/api-client";
import { getApiErrorCode, getApiErrorMessage, getHttpErrorStatus } from "@/lib/api-error";
import { twStyle } from "@/lib/twStyle";
import { Colors } from "@/constants/colors";

type StaffOption = { id: string; name: string };

type Props = {
  visible: boolean;
  bookingId: string;
  bookingServiceId: string;
  currentStaffId?: string | null;
  offeringId?: string;
  onClose: () => void;
  onReassigned: () => void;
};

export function ReassignStaffSheet({
  visible,
  bookingId,
  bookingServiceId,
  currentStaffId,
  offeringId,
  onClose,
  onReassigned,
}: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const staffUrl = offeringId
    ? `/api/provider/staff/available?offering_id=${offeringId}`
    : "/api/provider/staff";

  const { data, loading, refresh } = useApi<StaffOption[] | { data?: StaffOption[] }>(staffUrl);

  useEffect(() => {
    if (visible) {
      void refresh();
      setError(null);
    }
  }, [visible, refresh]);

  const staffList: StaffOption[] = Array.isArray(data)
    ? data
    : (data as { data?: StaffOption[] })?.data ?? [];

  const reassign = useCallback(
    async (staffId: string | null) => {
      setSaving(true);
      setError(null);
      try {
        const res = await api.patch(`/api/provider/bookings/${bookingId}`, {
          staff_id: staffId,
          booking_service_id: bookingServiceId,
        });
        if (res.error) {
          const status = getHttpErrorStatus(res.error);
          const code = getApiErrorCode(res.error);
          if (status === 409 || code === "CONFLICT") {
            setError("This booking changed, reload");
            onReassigned();
            return;
          }
          throw new Error(getApiErrorMessage(res.error, "Failed to reassign staff"));
        }
        onReassigned();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to reassign staff");
      } finally {
        setSaving(false);
      }
    },
    [bookingId, bookingServiceId, onClose, onReassigned],
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={twStyle("flex-1 justify-end bg-black/40")}>
        <View style={twStyle("bg-white rounded-t-3xl max-h-[70%]")}>
          <View style={twStyle("flex-row items-center justify-between px-4 py-4 border-b border-gray-100")}>
            <Text style={twStyle("text-lg font-semibold text-gray-900")}>Reassign staff</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={24} color="#6b7280" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={twStyle("py-12 items-center")}>
              <ActivityIndicator color={Colors.primary} />
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
              {error ? (
                <Text style={twStyle("text-sm text-red-600 mb-3")}>{error}</Text>
              ) : null}

              <TouchableOpacity
                disabled={saving}
                onPress={() => reassign(null)}
                style={twStyle("py-3 px-4 rounded-xl border border-gray-200 mb-2")}
              >
                <Text style={twStyle("text-base text-gray-800")}>Any available staff</Text>
              </TouchableOpacity>

              {staffList.map((member) => {
                const selected = member.id === currentStaffId;
                return (
                  <TouchableOpacity
                    key={member.id}
                    disabled={saving}
                    onPress={() => reassign(member.id)}
                    style={[
                      twStyle("py-3 px-4 rounded-xl border mb-2 flex-row items-center justify-between"),
                      selected ? { borderColor: Colors.primary, backgroundColor: "#f0fdf4" } : twStyle("border-gray-200"),
                    ]}
                  >
                    <Text style={twStyle("text-base text-gray-900")}>{member.name}</Text>
                    {selected ? <Ionicons name="checkmark-circle" size={20} color={Colors.primary} /> : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}
