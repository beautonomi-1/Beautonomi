import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Switch,
  Alert,
  Platform,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";
import { E164PhoneField } from "@/components/E164PhoneField";
import { validateE164Phone } from "@/lib/phone-country-codes";
import { twStyle } from "@/lib/twStyle";
import { useTranslation } from "@beautonomi/i18n";
import { api } from "@/lib/api-client";
import { useApiMutation } from "@/hooks/useApi";
import { StaffPhotoField } from "@/components/team/StaffPhotoField";
import { StaffCommissionEditor } from "@/components/team/StaffCommissionEditor";

type StaffJob = "stylist" | "senior" | "front_desk" | "manager";
const JOBS: StaffJob[] = ["stylist", "senior", "front_desk", "manager"];

const ROLES = [
  { labelKey: "roleStaff", value: "provider_staff" },
  { labelKey: "roleManager", value: "provider_manager" },
  { labelKey: "roleOwner", value: "provider_owner" },
] as const;

type SettingsPayload = {
  public_title?: string | null;
  is_service_provider?: boolean;
  enable_in_online_booking?: boolean;
  time_clock_enabled?: boolean;
  time_clock_pin?: string;
  bookable_from?: string | null;
  commission_enabled?: boolean;
  commission_rate?: number;
  service_commission_rate?: number | null;
  product_commission_rate?: number | null;
};

type MemberSnapshot = {
  id: string;
  name: string;
  email?: string;
  phone?: string | null;
  avatar_url?: string | null;
  role: string;
  commission_rate?: number | null;
};

function formatLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseYmdOrNull(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, mo, d] = s.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  return new Date(y, mo - 1, d, 12, 0, 0, 0);
}

type Props = {
  visible: boolean;
  onClose: () => void;
  member: MemberSnapshot;
  mode: "manager" | "self";
  isBusinessOwnerRow: boolean;
  isOwnerViewer: boolean;
  canManagePayroll: boolean;
  onSaved: () => void;
};

export function StaffProfileEditSheet({
  visible,
  onClose,
  member,
  mode,
  isBusinessOwnerRow,
  isOwnerViewer,
  canManagePayroll,
  onSaved,
}: Props) {
  const { t } = useTranslation();
  const tm = (key: string, opts?: Record<string, unknown>) =>
    t(`provider.mobile.screens.teamMember.${key}`, opts) as string;
  const wl = (key: string, opts?: Record<string, unknown>) =>
    t(`web.provider.teamAddWizard.${key}`, opts) as string;
  const tl = (key: string, opts?: Record<string, unknown>) =>
    t(`provider.mobile.screens.teamList.${key}`, opts) as string;
  const router = useRouter();
  const { execute: patchStaff, loading: savingStaff } = useApiMutation("patch");
  const { execute: patchSettings, loading: savingSettings } = useApiMutation("patch");

  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [role, setRole] = useState("provider_staff");
  const [publicTitle, setPublicTitle] = useState("");
  const [takesAppointments, setTakesAppointments] = useState(true);
  const [bookableFrom, setBookableFrom] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [timeClock, setTimeClock] = useState(false);
  const [timeClockPin, setTimeClockPin] = useState("");
  const [commissionEnabled, setCommissionEnabled] = useState(false);
  const [commissionPercent, setCommissionPercent] = useState(0);
  const [splitRatesEqual, setSplitRatesEqual] = useState(true);
  const [serviceRate, setServiceRate] = useState<number | null>(null);
  const [productRate, setProductRate] = useState<number | null>(null);

  const saving = savingStaff || savingSettings;

  const roleOptions = useMemo(() => {
    if (isBusinessOwnerRow && isOwnerViewer) return ROLES;
    if (isBusinessOwnerRow) return ROLES.filter((r) => r.value !== "provider_owner");
    return ROLES.filter((r) => r.value !== "provider_owner");
  }, [isBusinessOwnerRow, isOwnerViewer]);

  useEffect(() => {
    if (!visible) {
      setSettingsLoaded(false);
      return;
    }
    setName(member.name);
    setPhone(member.phone ?? "");
    setAvatarUrl(member.avatar_url ?? null);
    setRole(member.role);
    void (async () => {
      const res = await api.get<SettingsPayload>(`/api/provider/staff/${member.id}/settings`);
      const s = res.data;
      if (s) {
        setPublicTitle(s.public_title ?? "");
        const takes = s.is_service_provider !== false && s.enable_in_online_booking !== false;
        setTakesAppointments(takes);
        setBookableFrom(s.bookable_from ?? null);
        setTimeClock(s.time_clock_enabled === true);
        setTimeClockPin(s.time_clock_pin ?? "");
        const svc = s.service_commission_rate ?? null;
        const prod = s.product_commission_rate ?? null;
        setServiceRate(svc);
        setProductRate(prod);
        const equal = svc === prod;
        setSplitRatesEqual(equal);
        const enabled = s.commission_enabled === true;
        setCommissionEnabled(enabled);
        const thumb =
          svc != null ? svc : s.commission_rate != null ? s.commission_rate : member.commission_rate ?? 0;
        setCommissionPercent(Math.round(Number(thumb) || 0));
      }
      setSettingsLoaded(true);
    })();
  }, [visible, member]);

  const applyJob = useCallback(
    (job: StaffJob) => {
      const label = wl(`job_${job}`);
      Alert.alert(tm("applyJobTitle"), tm("applyJobBody", { job: label }), [
        { text: tm("cancel"), style: "cancel" },
        {
          text: tm("apply"),
          onPress: () => {
            void (async () => {
              const body: Record<string, unknown> = {
                job,
                service_ids: job === "front_desk" ? [] : undefined,
              };
              if (job === "front_desk") {
                body.service_ids = [];
              }
              const run = async (force?: boolean) => {
                const { error, errorCode } = await patchStaff(`/api/provider/staff/${member.id}`, {
                  ...body,
                  ...(force ? { force: true } : {}),
                });
                if (errorCode === "FUTURE_BOOKINGS_CONFLICT" && !force) {
                  Alert.alert(tl("upcomingBookingsTitle"), tl("upcomingBookingsBody"), [
                    { text: tl("cancel"), style: "cancel" },
                    {
                      text: tl("saveAnyway"),
                      style: "destructive",
                      onPress: () => void run(true),
                    },
                  ]);
                  return;
                }
                if (error) {
                  Alert.alert(tm("errorTitle"), error);
                  return;
                }
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                onSaved();
                onClose();
              };
              await run();
            })();
          },
        },
      ]);
    },
    [member.id, patchStaff, tm, tl, wl, onSaved, onClose],
  );

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      Alert.alert(tm("validationTitle"), tm("nameRequired"));
      return;
    }
    const phoneErr = phone.trim() ? validateE164Phone(phone) : null;
    if (phoneErr) {
      Alert.alert(tm("invalidPhoneTitle"), phoneErr);
      return;
    }
    if (timeClockPin && !/^\d{0,4}$/.test(timeClockPin)) {
      Alert.alert(tm("validationTitle"), tm("pinInvalid"));
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (mode === "self") {
      const { error: err } = await patchStaff(`/api/provider/staff/${member.id}`, {
        name: name.trim(),
        phone: phone.trim() || null,
        avatar_url: avatarUrl,
      });
      const settingsBody: Record<string, unknown> = {
        time_clock_enabled: timeClock,
        time_clock_pin: timeClockPin.trim(),
      };
      const { error: settingsErr } = await patchSettings(
        `/api/provider/staff/${member.id}/settings`,
        settingsBody,
      );
      if (err) {
        Alert.alert(tm("errorTitle"), err);
        return;
      }
      if (settingsErr) {
        Alert.alert(tm("partialSaveTitle"), tm("partialSaveSettingsFailed"));
        onSaved();
        onClose();
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSaved();
      onClose();
      Alert.alert(tm("updatedTitle"), tm("updatedBody"));
      return;
    }

    const staffBody: Record<string, unknown> = {
      name: name.trim(),
      phone: phone.trim() || null,
      avatar_url: avatarUrl,
    };
    if (role !== member.role) {
      staffBody.role = role;
    }
    if (canManagePayroll && splitRatesEqual) {
      staffBody.commission_rate = commissionEnabled ? Math.round(commissionPercent) : null;
    }

    const { error: staffErr } = await patchStaff(`/api/provider/staff/${member.id}`, staffBody);
    if (staffErr) {
      Alert.alert(tm("errorTitle"), staffErr);
      return;
    }

    const settingsPayload: Record<string, unknown> = {
      public_title: publicTitle.trim() || null,
      is_service_provider: takesAppointments,
      enable_in_online_booking: takesAppointments,
      bookable_from: bookableFrom,
      time_clock_enabled: timeClock,
      time_clock_pin: timeClockPin.trim(),
    };

    const { error: settingsErr } = await patchSettings(
      `/api/provider/staff/${member.id}/settings`,
      settingsPayload,
    );
    if (settingsErr) {
      Alert.alert(tm("partialSaveTitle"), tm("partialSaveSettingsFailed"));
      onSaved();
      onClose();
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSaved();
    onClose();
    Alert.alert(tm("updatedTitle"), tm("updatedBody"));
  }, [
    name,
    phone,
    avatarUrl,
    role,
    member,
    mode,
    commissionEnabled,
    commissionPercent,
    splitRatesEqual,
    canManagePayroll,
    publicTitle,
    takesAppointments,
    bookableFrom,
    timeClock,
    timeClockPin,
    patchStaff,
    patchSettings,
    tm,
    onSaved,
    onClose,
  ]);

  const bookableDate = bookableFrom ? parseYmdOrNull(bookableFrom) : null;

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={tm("editSheetTitle")}
      snapHeight="full"
    >
      <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 520 }}>
        <StaffPhotoField
          displayName={name || member.name}
          avatarUrl={avatarUrl}
          onChange={setAvatarUrl}
        />

        <Field label={tm("fullNameRequired")} value={name} onChangeText={setName} />
        <E164PhoneField
          label={tm("phone")}
          valueE164={phone}
          onChangeE164={setPhone}
          compact
          muted
        />
        <Text style={twStyle("mb-3 text-sm text-gray-500")}>
          {tm("emailReadOnly")}: {member.email ?? "—"}
        </Text>

        {mode === "manager" && settingsLoaded ? (
          <>
            <Field
              label={wl("publicTitle")}
              value={publicTitle}
              onChangeText={setPublicTitle}
              maxLength={120}
            />
            <View style={twStyle("mb-3 flex-row items-center justify-between")}>
              <Text style={twStyle("text-sm text-gray-800")}>{wl("takesAppointments")}</Text>
              <Switch
                value={takesAppointments}
                onValueChange={setTakesAppointments}
                disabled={false}
              />
            </View>

            <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
              {wl("startDateOptional")}
            </Text>
            <TouchableOpacity
              style={twStyle("mb-3 rounded-xl border border-gray-200 bg-white px-4 py-3")}
              onPress={() => setShowDatePicker(true)}
            >
              <Text style={twStyle("text-base text-gray-900")}>
                {bookableFrom ?? wl("bookableNow")}
              </Text>
            </TouchableOpacity>
            {bookableFrom ? (
              <TouchableOpacity onPress={() => setBookableFrom(null)} style={twStyle("mb-3")}>
                <Text style={twStyle("text-sm text-indigo-600")}>{tm("clearBookableDate")}</Text>
              </TouchableOpacity>
            ) : null}
            {showDatePicker ? (
              <DateTimePicker
                value={bookableDate ?? new Date()}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={(_, selected) => {
                  setShowDatePicker(Platform.OS === "ios");
                  if (selected) setBookableFrom(formatLocalYmd(selected));
                }}
              />
            ) : null}

            <View style={twStyle("mb-3 flex-row items-center justify-between")}>
              <Text style={twStyle("text-sm text-gray-800")}>{wl("timeClock")}</Text>
              <Switch value={timeClock} onValueChange={setTimeClock} />
            </View>
            {timeClock ? (
              <Field
                label={tm("timeClockPin")}
                value={timeClockPin}
                onChangeText={(v) => setTimeClockPin(v.replace(/\D/g, "").slice(0, 4))}
                keyboardType="number-pad"
              />
            ) : null}

            <Text style={twStyle("mb-1 mt-2 text-sm font-medium text-gray-700")}>{tm("role")}</Text>
            <View style={twStyle("mb-3 flex-row flex-wrap")}>
              {roleOptions.map((r) => (
                <TouchableOpacity
                  key={r.value}
                  style={[
                    twStyle(
                      `rounded-full px-4 py-2 ${role === r.value ? "bg-gray-900" : "border border-gray-200 bg-white"}`,
                    ),
                    { marginEnd: 8, marginBottom: 8 },
                  ]}
                  onPress={() => setRole(r.value)}
                >
                  <Text
                    style={twStyle(
                      `text-sm font-medium ${role === r.value ? "text-white" : "text-gray-600"}`,
                    )}
                  >
                    {tm(r.labelKey)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {!isBusinessOwnerRow ? (
              <>
                <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>
                  {tm("applyJobDefaults")}
                </Text>
                <View style={twStyle("mb-3 flex-row flex-wrap")}>
                  {JOBS.map((j) => (
                    <TouchableOpacity
                      key={j}
                      style={[
                        twStyle("rounded-full border border-gray-200 bg-white px-4 py-2"),
                        { marginEnd: 8, marginBottom: 8 },
                      ]}
                      onPress={() => applyJob(j)}
                    >
                      <Text style={twStyle("text-sm text-gray-700")}>{wl(`job_${j}`)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ) : null}

            {canManagePayroll ? (
              <StaffCommissionEditor
                enabled={commissionEnabled}
                onEnabledChange={setCommissionEnabled}
                percent={commissionPercent}
                onPercentChange={setCommissionPercent}
                splitRatesEqual={splitRatesEqual}
                serviceRate={serviceRate}
                productRate={productRate}
                onOpenCommissions={() =>
                  router.push(
                    `/(app)/(tabs)/more/settings/team-commissions?staffId=${member.id}` as never,
                  )
                }
              />
            ) : null}
          </>
        ) : mode === "self" ? (
          <>
            <View style={twStyle("mb-3 flex-row items-center justify-between")}>
              <Text style={twStyle("text-sm text-gray-800")}>{wl("timeClock")}</Text>
              <Switch value={timeClock} onValueChange={setTimeClock} />
            </View>
            {timeClock ? (
              <Field
                label={tm("timeClockPin")}
                value={timeClockPin}
                onChangeText={(v) => setTimeClockPin(v.replace(/\D/g, "").slice(0, 4))}
                keyboardType="number-pad"
              />
            ) : null}
          </>
        ) : null}
      </ScrollView>

      <ActionButton label={tm("saveChanges")} onPress={() => void handleSave()} loading={saving} fullWidth />
    </BottomSheet>
  );
}

function Field({
  label,
  value,
  onChangeText,
  keyboardType,
  maxLength,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  keyboardType?: "number-pad" | "default";
  maxLength?: number;
}) {
  return (
    <View style={twStyle("mb-3")}>
      <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{label}</Text>
      <TextInput
        style={twStyle("rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900")}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        maxLength={maxLength}
        autoCapitalize="none"
      />
    </View>
  );
}
