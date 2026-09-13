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
import { useTranslation } from "@beautonomi/i18n";

/* ─── types matching actual API contracts ─── */
interface AppointmentSettings {
  defaultAppointmentStatus: string;
  autoConfirmAppointments: boolean;
  requireConfirmationForBookings: boolean;
  confirmationSlaHours: number;
  unconfirmedExpireHoursBeforeSlot: number;
  closeoutGraceMinutesSalon: number;
  closeoutGraceMinutesAtHome: number;
  lateArrivalGraceMinutes: number;
  updatedAt: string | null;
  availableStatuses: string[];
}

interface OnlineBookingSettings {
  enabled: boolean;
  advanceNoticeHours: number;
  cancellationHours: number;
}

interface CustomRequestSettings {
  acceptsCustomRequests: boolean;
}

const STATUS_KEYS: Record<string, string> = {
  pending: "statusPending",
  booked: "statusBooked",
  started: "statusStarted",
  completed: "statusCompleted",
  cancelled: "statusCancelled",
  no_show: "statusNoShow",
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
      <View style={twStyle("me-3 flex-1")}>
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
      <View style={twStyle("me-3 flex-1")}>
        <Text style={twStyle("text-sm font-medium text-gray-700")}>{label}</Text>
        {description && (
          <Text style={twStyle("mt-0.5 text-xs text-gray-400")}>{description}</Text>
        )}
      </View>

      <View style={twStyle("flex-row items-center")}>
        <TouchableOpacity
          style={[twStyle(`min-h-[44px] min-w-[44px] items-center justify-center rounded-lg ${value <= min ? "bg-gray-100" : "bg-gray-200"}`), { marginEnd: 4 }]}
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

        <View style={[twStyle("min-w-[64px] items-center rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5"), { marginEnd: 4 }]}>
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
  const { t } = useTranslation();
  const bs = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.screens.bookingSettings.${key}`, opts) as string,
    [t],
  );

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

  const {
    data: customRequestSettings,
    loading: customLoading,
    error: customError,
    refresh: refreshCustom,
  } = useApi<CustomRequestSettings>("/api/provider/settings/custom-requests");

  const { execute: saveAppt, loading: savingAppt } = useApiMutation("patch");
  const { execute: saveOnline, loading: savingOnline } = useApiMutation("patch");
  const { execute: saveCustomRequests, loading: savingCustom } = useApiMutation("patch");

  const loading = apptLoading || onlineLoading || customLoading;
  const saving = savingAppt || savingOnline || savingCustom;

  const [autoConfirm, setAutoConfirm] = useState(false);
  const [requireConfirmation, setRequireConfirmation] = useState(true);
  const [defaultStatus, setDefaultStatus] = useState("booked");
  const [confirmationSlaHours, setConfirmationSlaHours] = useState(2);
  const [unconfirmedExpireHours, setUnconfirmedExpireHours] = useState(2);
  const [closeoutGraceSalon, setCloseoutGraceSalon] = useState(20);
  const [closeoutGraceAtHome, setCloseoutGraceAtHome] = useState(30);
  const [lateArrivalGraceMinutes, setLateArrivalGraceMinutes] = useState(0);

  const [enabled, setEnabled] = useState(true);
  const [advanceNoticeHours, setAdvanceNoticeHours] = useState(24);
  const [cancellationHours, setCancellationHours] = useState(24);

  const [acceptsCustomRequests, setAcceptsCustomRequests] = useState(true);

  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (apptSettings) {
      setAutoConfirm(apptSettings.autoConfirmAppointments ?? false);
      setRequireConfirmation(apptSettings.requireConfirmationForBookings ?? true);
      setDefaultStatus(apptSettings.defaultAppointmentStatus ?? "booked");
      setConfirmationSlaHours(apptSettings.confirmationSlaHours ?? 2);
      setUnconfirmedExpireHours(apptSettings.unconfirmedExpireHoursBeforeSlot ?? 2);
      setCloseoutGraceSalon(apptSettings.closeoutGraceMinutesSalon ?? 20);
      setCloseoutGraceAtHome(apptSettings.closeoutGraceMinutesAtHome ?? 30);
      setLateArrivalGraceMinutes(apptSettings.lateArrivalGraceMinutes ?? 0);
    }
  }, [apptSettings]);

  useEffect(() => {
    if (onlineSettings) {
      setEnabled(onlineSettings.enabled ?? true);
      setAdvanceNoticeHours(onlineSettings.advanceNoticeHours ?? 24);
      setCancellationHours(onlineSettings.cancellationHours ?? 24);
    }
  }, [onlineSettings]);

  useEffect(() => {
    if (customRequestSettings) {
      setAcceptsCustomRequests(customRequestSettings.acceptsCustomRequests !== false);
    }
  }, [customRequestSettings]);

  function markChanged() {
    setHasChanges(true);
  }

  const handleSave = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const apptPayload = {
      defaultAppointmentStatus: defaultStatus,
      autoConfirmAppointments: autoConfirm,
      requireConfirmationForBookings: requireConfirmation,
      confirmationSlaHours,
      unconfirmedExpireHoursBeforeSlot: unconfirmedExpireHours,
      closeoutGraceMinutesSalon: closeoutGraceSalon,
      closeoutGraceMinutesAtHome: closeoutGraceAtHome,
      lateArrivalGraceMinutes,
    };

    const onlinePayload = {
      enabled,
      advanceNoticeHours,
      cancellationHours,
    };

    const customPayload = { acceptsCustomRequests };

    const [apptRes, onlineRes, customRes] = await Promise.all([
      saveAppt("/api/provider/settings/appointments", apptPayload),
      saveOnline("/api/provider/settings/online-booking", onlinePayload),
      saveCustomRequests("/api/provider/settings/custom-requests", customPayload),
    ]);

    if (apptRes.error || onlineRes.error || customRes.error) {
      Alert.alert(bs("errorTitle"), apptRes.error || onlineRes.error || customRes.error || bs("saveFailed"));
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(bs("savedTitle"), bs("savedBody"));
      setHasChanges(false);
      refreshAppt();
      refreshOnline();
      refreshCustom();
    }
  }, [
    saveAppt, saveOnline, saveCustomRequests, defaultStatus, autoConfirm, requireConfirmation,
    confirmationSlaHours, unconfirmedExpireHours, closeoutGraceSalon, closeoutGraceAtHome, lateArrivalGraceMinutes,
    enabled, advanceNoticeHours, cancellationHours, acceptsCustomRequests, refreshAppt, refreshOnline, refreshCustom,
  ]);

  const availableStatuses = apptSettings?.availableStatuses ?? [
    "pending", "booked", "started", "completed", "cancelled", "no_show",
  ];

  if (loading) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title={bs("title")} showBack />
        <LoadingState />
      </ScreenContainer>
    );
  }

  const fetchError = apptError || onlineError || customError;
  if (fetchError && !apptSettings && !onlineSettings && !customRequestSettings) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title={bs("title")} showBack />
        <ErrorState message={fetchError} onRetry={() => { refreshAppt(); refreshOnline(); refreshCustom(); }} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader title={bs("title")} showBack />

      {(apptError || onlineError || customError) && (apptSettings || onlineSettings || customRequestSettings) && (
        <View style={twStyle("mb-3 rounded-xl bg-amber-50 border border-amber-200 p-3")}>
          <Text style={twStyle("text-xs text-amber-800")}>
            {bs("partialLoadWarning")}
          </Text>
        </View>
      )}

      {/* ─── Online Booking ─── */}
      <SectionHeader title={bs("sectionOnlineBooking")} />
      <View style={twStyle("rounded-2xl border border-gray-100 bg-white px-4")}>
        <ToggleRow
          label={bs("onlineBooking")}
          description={bs("onlineBookingDesc")}
          value={enabled}
          onValueChange={(v) => { setEnabled(v); markChanged(); }}
        />
        <ToggleRow
          label={bs("autoConfirm")}
          description={bs("autoConfirmDesc")}
          value={autoConfirm}
          onValueChange={(v) => { setAutoConfirm(v); markChanged(); }}
        />
        <View style={twStyle("border-b-0")}>
          <ToggleRow
            label={bs("requireConfirmation")}
            description={bs("requireConfirmationDesc")}
            value={requireConfirmation}
            onValueChange={(v) => { setRequireConfirmation(v); markChanged(); }}
          />
        </View>
      </View>

      {/* ─── Default Appointment Status ─── */}
      <SectionHeader title={bs("sectionDefaultStatus")} />
      <View style={twStyle("rounded-2xl border border-gray-100 bg-white px-4 py-2")}>
        <Text style={twStyle("mb-2 text-xs text-gray-400")}>
          {bs("defaultStatusHint")}
        </Text>
        <View style={twStyle("flex-row flex-wrap pb-2")}>
          {availableStatuses.map((status) => {
            const statusLabel = STATUS_KEYS[status] ? bs(STATUS_KEYS[status]) : status;
            return (
            <TouchableOpacity
              key={status}
              style={[twStyle(`rounded-full px-4 py-2 ${defaultStatus === status ? "bg-indigo-600" : "border border-gray-200 bg-gray-50"}`), { marginEnd: 8, marginBottom: 8 }]}
              onPress={() => { setDefaultStatus(status); markChanged(); }}
              accessibilityLabel={bs("setDefaultStatusA11y", { status: statusLabel })}
              accessibilityRole="button"
            >
              <Text
                style={twStyle(`text-sm font-medium capitalize ${defaultStatus === status ? "text-white" : "text-gray-600"}`)}
              >
                {statusLabel}
              </Text>
            </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* ─── Custom service requests ─── */}
      <SectionHeader title={bs("sectionCustomRequests")} />
      <View style={twStyle("rounded-2xl border border-gray-100 bg-white px-4")}>
        <ToggleRow
          label={bs("acceptCustomRequests")}
          description={bs("acceptCustomRequestsDesc")}
          value={acceptsCustomRequests}
          onValueChange={(v) => {
            setAcceptsCustomRequests(v);
            markChanged();
          }}
        />
      </View>

      {/* ─── Booking lifecycle ─── */}
      <SectionHeader title={bs("sectionLifecycle")} />
      <View style={twStyle("rounded-2xl border border-gray-100 bg-white px-4")}>
        <NumericInput
          label={bs("confirmationSla")}
          description={bs("confirmationSlaDesc")}
          value={confirmationSlaHours}
          onValueChange={(v) => { setConfirmationSlaHours(v); markChanged(); }}
          unit={bs("unitHours")}
          min={1}
          max={72}
          step={1}
        />
        <NumericInput
          label={bs("unconfirmedExpiry")}
          description={bs("unconfirmedExpiryDesc")}
          value={unconfirmedExpireHours}
          onValueChange={(v) => { setUnconfirmedExpireHours(v); markChanged(); }}
          unit={bs("unitHours")}
          min={1}
          max={48}
          step={1}
        />
        <NumericInput
          label={bs("salonCloseOutGrace")}
          description={bs("salonCloseOutGraceDesc")}
          value={closeoutGraceSalon}
          onValueChange={(v) => { setCloseoutGraceSalon(v); markChanged(); }}
          unit={bs("unitMinutes")}
          min={5}
          max={180}
          step={5}
        />
        <NumericInput
          label={bs("houseCallCloseOutGrace")}
          description={bs("houseCallCloseOutGraceDesc")}
          value={closeoutGraceAtHome}
          onValueChange={(v) => { setCloseoutGraceAtHome(v); markChanged(); }}
          unit={bs("unitMinutes")}
          min={5}
          max={180}
          step={5}
        />
        <NumericInput
          label={bs("lateArrivalGrace")}
          description={bs("lateArrivalGraceDesc")}
          value={lateArrivalGraceMinutes}
          onValueChange={(v) => { setLateArrivalGraceMinutes(v); markChanged(); }}
          unit={bs("unitMinutes")}
          min={0}
          max={60}
          step={5}
        />
      </View>

      {/* ─── Scheduling ─── */}
      <SectionHeader title={bs("sectionScheduling")} />
      <View style={twStyle("rounded-2xl border border-gray-100 bg-white px-4")}>
        <NumericInput
          label={bs("advanceNotice")}
          description={bs("advanceNoticeDesc")}
          value={advanceNoticeHours}
          onValueChange={(v) => { setAdvanceNoticeHours(v); markChanged(); }}
          unit={bs("unitHours")}
          min={0}
          max={168}
          step={1}
        />
        <NumericInput
          label={bs("cancellationWindow")}
          description={bs("cancellationWindowDesc")}
          value={cancellationHours}
          onValueChange={(v) => { setCancellationHours(v); markChanged(); }}
          unit={bs("unitHours")}
          min={0}
          max={168}
          step={1}
        />
      </View>

      {/* ─── Save ─── */}
      <View style={twStyle("mt-6")}>
        <ActionButton
          label={saving ? bs("saving") : bs("saveSettings")}
          onPress={handleSave}
          loading={saving}
          disabled={!hasChanges}
          fullWidth
        />
      </View>

      {hasChanges && (
        <Text style={twStyle("mt-2 text-center text-xs text-amber-600")}>
          {bs("unsavedChanges")}
        </Text>
      )}

      <View style={twStyle("h-8")} />
    </ScreenContainer>
  );
}
