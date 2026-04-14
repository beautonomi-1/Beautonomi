import { useState, useEffect, useCallback } from "react";
import * as Haptics from "expo-haptics";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ActionButton } from "@/components/ui/ActionButton";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { twStyle } from "@/lib/twStyle";

/* ─── types matching actual API contracts ─── */
interface AppointmentSettings {
  defaultAppointmentStatus: string;
  autoConfirmAppointments: boolean;
  requireConfirmationForBookings: boolean;
  updatedAt: string | null;
  availableStatuses: string[];
}

interface OnlineBookingSettings {
  enabled: boolean;
  advanceNoticeHours: number;
  cancellationHours: number;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  booked: "Booked",
  started: "Started",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No Show",
};

/* ─── reusable components ─── */
function ToggleRow({
  label,
  description,
  value,
  onValueChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View style={twStyle("flex-row items-center justify-between border-b border-gray-50 py-3")}>
      <View style={twStyle("mr-3 flex-1")}>
        <Text style={twStyle("text-sm font-medium text-gray-700")}>{label}</Text>
        {description && (
          <Text style={twStyle("mt-0.5 text-xs text-gray-400")}>{description}</Text>
        )}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: "#d1d5db", true: "#818cf8" }}
        thumbColor={value ? "#6366f1" : "#f3f4f6"}
        accessibilityLabel={label}
      />
    </View>
  );
}

function NumericInput({
  label,
  description,
  value,
  onValueChange,
  unit,
  min = 0,
  max = 9999,
  step = 1,
}: {
  label: string;
  description?: string;
  value: number;
  onValueChange: (v: number) => void;
  unit: string;
  min?: number;
  max?: number;
  step?: number;
}) {
  function decrement() {
    const next = value - step;
    if (next >= min) onValueChange(next);
  }

  function increment() {
    const next = value + step;
    if (next <= max) onValueChange(next);
  }

  return (
    <View
      style={twStyle("flex-row items-center justify-between border-b border-gray-50 py-3")}
      accessibilityLabel={`${label}: ${value} ${unit}`}
    >
      <View style={twStyle("mr-3 flex-1")}>
        <Text style={twStyle("text-sm font-medium text-gray-700")}>{label}</Text>
        {description && (
          <Text style={twStyle("mt-0.5 text-xs text-gray-400")}>{description}</Text>
        )}
      </View>

      <View style={twStyle("flex-row items-center")}>
        <TouchableOpacity
          style={[twStyle(`min-h-[44px] min-w-[44px] items-center justify-center rounded-lg ${value <= min ? "bg-gray-100" : "bg-gray-200"}`), { marginRight: 4 }]}
          onPress={decrement}
          disabled={value <= min}
          accessibilityLabel={`Decrease ${label}`}
          accessibilityRole="button"
        >
          <Ionicons
            name="remove"
            size={18}
            color={value <= min ? "#d1d5db" : "#374151"}
          />
        </TouchableOpacity>

        <View style={[twStyle("min-w-[64px] items-center rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5"), { marginRight: 4 }]}>
          <Text style={twStyle("text-sm font-semibold text-gray-900")}>
            {value}
          </Text>
          <Text style={twStyle("text-[10px] text-gray-400")}>{unit}</Text>
        </View>

        <TouchableOpacity
          style={twStyle(`min-h-[44px] min-w-[44px] items-center justify-center rounded-lg ${value >= max ? "bg-gray-100" : "bg-indigo-100"}`)}
          onPress={increment}
          disabled={value >= max}
          accessibilityLabel={`Increase ${label}`}
          accessibilityRole="button"
        >
          <Ionicons
            name="add"
            size={18}
            color={value >= max ? "#d1d5db" : "#6366f1"}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

/* ─── screen ─── */
export default function BookingSettingsScreen() {
  const {
    data: apptSettings,
    loading: apptLoading,
    error: apptError,
    refresh: refreshAppt,
  } = useApi<AppointmentSettings>("/api/provider/settings/appointments");

  const {
    data: onlineSettings,
    loading: onlineLoading,
    error: onlineError,
    refresh: refreshOnline,
  } = useApi<OnlineBookingSettings>("/api/provider/settings/online-booking");

  const { execute: saveAppt, loading: savingAppt } = useApiMutation("patch");
  const { execute: saveOnline, loading: savingOnline } = useApiMutation("patch");

  const loading = apptLoading || onlineLoading;
  const saving = savingAppt || savingOnline;

  const [autoConfirm, setAutoConfirm] = useState(false);
  const [requireConfirmation, setRequireConfirmation] = useState(true);
  const [defaultStatus, setDefaultStatus] = useState("booked");

  const [enabled, setEnabled] = useState(true);
  const [advanceNoticeHours, setAdvanceNoticeHours] = useState(24);
  const [cancellationHours, setCancellationHours] = useState(24);

  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (apptSettings) {
      setAutoConfirm(apptSettings.autoConfirmAppointments ?? false);
      setRequireConfirmation(apptSettings.requireConfirmationForBookings ?? true);
      setDefaultStatus(apptSettings.defaultAppointmentStatus ?? "booked");
    }
  }, [apptSettings]);

  useEffect(() => {
    if (onlineSettings) {
      setEnabled(onlineSettings.enabled ?? true);
      setAdvanceNoticeHours(onlineSettings.advanceNoticeHours ?? 24);
      setCancellationHours(onlineSettings.cancellationHours ?? 24);
    }
  }, [onlineSettings]);

  function markChanged() {
    setHasChanges(true);
  }

  const handleSave = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const apptPayload = {
      defaultAppointmentStatus: defaultStatus,
      autoConfirmAppointments: autoConfirm,
      requireConfirmationForBookings: requireConfirmation,
    };

    const onlinePayload = {
      enabled,
      advanceNoticeHours,
      cancellationHours,
    };

    const [apptRes, onlineRes] = await Promise.all([
      saveAppt("/api/provider/settings/appointments", apptPayload),
      saveOnline("/api/provider/settings/online-booking", onlinePayload),
    ]);

    if (apptRes.error || onlineRes.error) {
      Alert.alert("Error", apptRes.error || onlineRes.error || "Failed to save");
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Saved", "Booking settings updated successfully.");
      setHasChanges(false);
      refreshAppt();
      refreshOnline();
    }
  }, [
    saveAppt, saveOnline, defaultStatus, autoConfirm, requireConfirmation,
    enabled, advanceNoticeHours, cancellationHours, refreshAppt, refreshOnline,
  ]);

  const availableStatuses = apptSettings?.availableStatuses ?? [
    "pending", "booked", "started", "completed", "cancelled", "no_show",
  ];

  if (loading) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Booking Settings" showBack />
        <LoadingState />
      </ScreenContainer>
    );
  }

  const fetchError = apptError || onlineError;
  if (fetchError && !apptSettings && !onlineSettings) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Booking Settings" showBack />
        <ErrorState message={fetchError} onRetry={() => { refreshAppt(); refreshOnline(); }} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader title="Booking Settings" showBack />

      {(apptError || onlineError) && (apptSettings || onlineSettings) && (
        <View style={twStyle("mb-3 rounded-xl bg-amber-50 border border-amber-200 p-3")}>
          <Text style={twStyle("text-xs text-amber-800")}>
            Some settings could not be loaded. The values shown may be defaults. Pull down to retry.
          </Text>
        </View>
      )}

      {/* ─── Online Booking ─── */}
      <SectionHeader title="Online Booking" />
      <View style={twStyle("rounded-2xl border border-gray-100 bg-white px-4")}>
        <ToggleRow
          label="Online Booking"
          description="Allow clients to book online"
          value={enabled}
          onValueChange={(v) => { setEnabled(v); markChanged(); }}
        />
        <ToggleRow
          label="Auto Confirm"
          description="Automatically confirm new bookings"
          value={autoConfirm}
          onValueChange={(v) => { setAutoConfirm(v); markChanged(); }}
        />
        <View style={twStyle("border-b-0")}>
          <ToggleRow
            label="Require Confirmation"
            description="Manually approve bookings"
            value={requireConfirmation}
            onValueChange={(v) => { setRequireConfirmation(v); markChanged(); }}
          />
        </View>
      </View>

      {/* ─── Default Appointment Status ─── */}
      <SectionHeader title="Default Appointment Status" />
      <View style={twStyle("rounded-2xl border border-gray-100 bg-white px-4 py-2")}>
        <Text style={twStyle("mb-2 text-xs text-gray-400")}>
          New appointments will be created with this status
        </Text>
        <View style={twStyle("flex-row flex-wrap pb-2")}>
          {availableStatuses.map((status) => (
            <TouchableOpacity
              key={status}
              style={[twStyle(`rounded-full px-4 py-2 ${defaultStatus === status ? "bg-indigo-600" : "border border-gray-200 bg-gray-50"}`), { marginRight: 8, marginBottom: 8 }]}
              onPress={() => { setDefaultStatus(status); markChanged(); }}
              accessibilityLabel={`Set default status to ${STATUS_LABELS[status] ?? status}`}
              accessibilityRole="button"
            >
              <Text
                style={twStyle(`text-sm font-medium capitalize ${defaultStatus === status ? "text-white" : "text-gray-600"}`)}
              >
                {STATUS_LABELS[status] ?? status}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ─── Scheduling ─── */}
      <SectionHeader title="Scheduling" />
      <View style={twStyle("rounded-2xl border border-gray-100 bg-white px-4")}>
        <NumericInput
          label="Advance Notice"
          description="Minimum hours before appointment time"
          value={advanceNoticeHours}
          onValueChange={(v) => { setAdvanceNoticeHours(v); markChanged(); }}
          unit="hours"
          min={0}
          max={168}
          step={1}
        />
        <NumericInput
          label="Cancellation Window"
          description="Hours before appointment clients can cancel"
          value={cancellationHours}
          onValueChange={(v) => { setCancellationHours(v); markChanged(); }}
          unit="hours"
          min={0}
          max={168}
          step={1}
        />
      </View>

      {/* ─── Save ─── */}
      <View style={twStyle("mt-6")}>
        <ActionButton
          label={saving ? "Saving\u2026" : "Save Settings"}
          onPress={handleSave}
          loading={saving}
          disabled={!hasChanges}
          fullWidth
        />
      </View>

      {hasChanges && (
        <Text style={twStyle("mt-2 text-center text-xs text-amber-600")}>
          You have unsaved changes
        </Text>
      )}

      <View style={twStyle("h-8")} />
    </ScreenContainer>
  );
}
