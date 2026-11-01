import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Switch,
  Share,
  Alert,
  ScrollView,
  Platform,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useTranslation } from "@beautonomi/i18n";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";
import { E164PhoneField } from "@/components/E164PhoneField";
import { validateE164Phone } from "@/lib/phone-country-codes";
import { twStyle } from "@/lib/twStyle";
import { isPlanGateErrorCode, showPlanGateAlert } from "@/lib/plan-gate";
import { useRouter } from "expo-router";
import { validateEmail } from "@/lib/validation";
import { StaffPhotoField } from "@/components/team/StaffPhotoField";
import { StaffCommissionEditor } from "@/components/team/StaffCommissionEditor";

type WizardRouter = ReturnType<typeof useRouter>;

type StaffJob = "stylist" | "senior" | "front_desk" | "manager";

const JOBS: StaffJob[] = ["stylist", "senior", "front_desk", "manager"];

type NamedLocation = { id: string; name: string };
type NamedOffering = { id: string; title: string };

type Props = {
  visible: boolean;
  onClose: () => void;
  locationIds: string[];
  offeringIds: string[];
  locations?: NamedLocation[];
  offerings?: NamedOffering[];
  staffOptions: Array<{ id: string; name: string }>;
  staffLimit?: {
    canProceed: boolean;
    currentCount: number;
    limitValue: number | null;
  };
  onCreated: () => void;
  createMember: (
    payload: Record<string, unknown>,
  ) => Promise<{
    data?: {
      id?: string;
      join_url?: string | null;
      email_delivered?: boolean;
      hours_copied?: boolean;
    } | null;
    error?: string | null;
    errorCode?: string | null;
  }>;
  router: WizardRouter;
};

type Ready = {
  joinUrl: string | null;
  emailDelivered: boolean;
  name: string;
  job: StaffJob;
  serviceCount: number;
  hoursCopied: boolean;
};

export function StaffAddWizardSheet({
  visible,
  onClose,
  locationIds,
  offeringIds,
  locations = [],
  offerings = [],
  staffOptions,
  staffLimit,
  onCreated,
  createMember,
  router,
}: Props) {
  const { t } = useTranslation();
  const wl = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`web.provider.teamAddWizard.${key}`, opts) as string,
    [t],
  );

  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState<Ready | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [job, setJob] = useState<StaffJob>("stylist");
  const [publicTitle, setPublicTitle] = useState("");
  const [takesAppointments, setTakesAppointments] = useState(true);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [commissionEnabled, setCommissionEnabled] = useState(false);
  const [commissionPercent, setCommissionPercent] = useState(0);
  const [showBookableDatePicker, setShowBookableDatePicker] = useState(false);
  const [copyStaffId, setCopyStaffId] = useState("");
  const [bookableFrom, setBookableFrom] = useState("");
  const [timeClock, setTimeClock] = useState(false);
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([]);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);

  const bookableJob = takesAppointments && job !== "front_desk";
  const branchOptions = locations.length > 0 ? locations : locationIds.map((id) => ({ id, name: id }));
  const serviceOptions =
    offerings.length > 0 ? offerings : offeringIds.map((id) => ({ id, title: id }));
  const showBranchPicker = locations.length > 1 || locationIds.length > 1;
  const showServicePicker = bookableJob && serviceOptions.length > 0;

  const seatLine = useMemo(() => {
    if (!staffLimit || staffLimit.limitValue == null) return null;
    return wl("seatLine", { current: staffLimit.currentCount, max: staffLimit.limitValue });
  }, [staffLimit, wl]);

  useEffect(() => {
    if (visible) {
      setSelectedLocationIds(locationIds);
      setSelectedServiceIds(offeringIds);
    } else {
      setStep(0);
      setReady(null);
      setName("");
      setEmail("");
      setPhone("");
      setJob("stylist");
      setPublicTitle("");
      setTakesAppointments(true);
      setAvatarUrl(null);
      setCommissionEnabled(false);
      setCommissionPercent(0);
      setShowBookableDatePicker(false);
      setCopyStaffId("");
      setBookableFrom("");
      setTimeClock(false);
      setSelectedLocationIds([]);
      setSelectedServiceIds([]);
    }
  }, [visible, locationIds, offeringIds]);

  async function submit() {
    if (staffLimit && !staffLimit.canProceed) {
      Alert.alert(wl("limitBlocked"));
      return;
    }
    if (!name.trim() || !email.trim()) {
      Alert.alert(wl("nameEmailRequired"));
      return;
    }
    const phoneErr = phone.trim() ? validateE164Phone(phone) : null;
    if (phoneErr) {
      Alert.alert(phoneErr);
      return;
    }
    setSubmitting(true);
    const branchIds =
      selectedLocationIds.length > 0 ? selectedLocationIds : locationIds;
    const serviceIds = bookableJob ? selectedServiceIds : [];
    const hours_source = copyStaffId
      ? { type: "staff" as const, staff_id: copyStaffId }
      : { type: "location" as const, location_id: branchIds[0] };
    const payload = {
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim() || undefined,
      job,
      public_title: publicTitle.trim() || null,
      takes_appointments: job === "front_desk" ? false : takesAppointments,
      commission_rate: commissionEnabled ? Math.round(commissionPercent) : null,
      ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
      invite_email: true,
      location_ids: branchIds,
      service_ids: serviceIds,
      hours_source,
      bookable_from: bookableFrom.trim() || null,
      time_clock_enabled: timeClock,
    };
    const { data, error, errorCode } = await createMember(payload);
    setSubmitting(false);
    if (error) {
      if (isPlanGateErrorCode(errorCode)) {
        showPlanGateAlert({ message: error, errorCode, router });
      } else {
        Alert.alert(wl("createFailed"), error);
      }
      return;
    }
    onCreated();
    setReady({
      joinUrl: data?.join_url ?? null,
      emailDelivered: data?.email_delivered === true,
      name: name.trim(),
      job,
      serviceCount: serviceIds.length,
      hoursCopied: (data as { hours_copied?: boolean } | null)?.hours_copied === true,
    });
    setStep(4);
  }

  function formatLocalYmd(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function goToNextStep() {
    if (step === 0) {
      if (!name.trim()) {
        Alert.alert(wl("nameEmailRequired"));
        return;
      }
      const emailErr = validateEmail(email.trim(), true);
      if (emailErr) {
        Alert.alert(wl("nameEmailRequired"));
        return;
      }
      const phoneErr = phone.trim() ? validateE164Phone(phone) : null;
      if (phoneErr) {
        Alert.alert(phoneErr);
        return;
      }
    }
    if (step === 2 && selectedLocationIds.length === 0 && locationIds.length > 0) {
      Alert.alert(wl("selectBranch"));
      return;
    }
    setStep((s) => s + 1);
  }

  function onJobSelect(j: StaffJob) {
    setJob(j);
    if (j === "front_desk") setTakesAppointments(false);
  }

  async function shareLink() {
    if (!ready?.joinUrl) return;
    await Share.share({ message: ready.joinUrl });
  }

  function toggleLocation(id: string) {
    setSelectedLocationIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleService(id: string) {
    setSelectedServiceIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={ready ? wl("readyTitle") : wl("title")}
      snapHeight="full"
    >
      {seatLine && !ready ? (
        <Text style={twStyle("mb-2 text-xs text-gray-500")}>{seatLine}</Text>
      ) : null}

      {ready ? (
        <View style={twStyle("gap-3")}>
          <Text style={twStyle("text-sm text-gray-800")}>
            {ready.emailDelivered
              ? wl("inviteEmailed", { name: ready.name })
              : wl("inviteLinkReady")}
          </Text>
          {ready.joinUrl ? (
            <ActionButton label={wl("shareLink")} onPress={() => void shareLink()} fullWidth />
          ) : null}
          <Text style={twStyle("text-sm text-gray-600")}>
            {bookableJob
              ? wl("bookableSummary", {
                  count: ready.serviceCount,
                  from: bookableFrom.trim() || wl("bookableNow"),
                })
              : wl("notOnPublicBooking")}
          </Text>
          {!ready.hoursCopied ? (
            <Text style={twStyle("text-sm text-gray-500")}>{wl("hintNoHoursCopied")}</Text>
          ) : null}
          <ActionButton label={wl("done")} onPress={onClose} fullWidth />
        </View>
      ) : step === 0 ? (
        <View>
          <StaffPhotoField displayName={name || wl("name")} avatarUrl={avatarUrl} onChange={setAvatarUrl} />
          <Field label={wl("name")} value={name} onChangeText={setName} />
          <Field label={wl("email")} value={email} onChangeText={setEmail} keyboardType="email-address" />
          <E164PhoneField
            label={wl("mobile")}
            valueE164={phone}
            onChangeE164={setPhone}
            compact
            muted
          />
        </View>
      ) : step === 1 ? (
        <View>
          <Field
            label={wl("publicTitle")}
            value={publicTitle}
            onChangeText={setPublicTitle}
            maxLength={120}
          />
          <View style={twStyle("mb-3 flex-row items-center justify-between")}>
            <Text style={twStyle("text-sm text-gray-800")}>{wl("takesAppointments")}</Text>
            <Switch
              value={job === "front_desk" ? false : takesAppointments}
              onValueChange={setTakesAppointments}
              disabled={job === "front_desk"}
            />
          </View>
          <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>{wl("job")}</Text>
          <View style={twStyle("mb-3 flex-row flex-wrap")}>
            {JOBS.map((j) => (
              <TouchableOpacity
                key={j}
                style={[
                  twStyle(`rounded-full px-4 py-2 ${job === j ? "bg-gray-900" : "border border-gray-200 bg-white"}`),
                  { marginEnd: 8, marginBottom: 8 },
                ]}
                onPress={() => onJobSelect(j)}
              >
                <Text style={twStyle(`text-sm ${job === j ? "text-white" : "text-gray-700"}`)}>
                  {wl(`job_${j}`)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {job === "front_desk" ? (
            <Text style={twStyle("mb-2 text-xs text-gray-500")}>{wl("frontDeskHint")}</Text>
          ) : null}
          <StaffCommissionEditor
            enabled={commissionEnabled}
            onEnabledChange={setCommissionEnabled}
            percent={commissionPercent}
            onPercentChange={setCommissionPercent}
            splitRatesEqual
            serviceRate={null}
            productRate={null}
          />
        </View>
      ) : step === 2 ? (
        <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 420 }}>
          {showBranchPicker ? (
            <View style={twStyle("mb-4")}>
              <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>{wl("branches")}</Text>
              <View style={twStyle("flex-row flex-wrap")}>
                {branchOptions.map((loc) => (
                  <Chip
                    key={loc.id}
                    selected={selectedLocationIds.includes(loc.id)}
                    label={loc.name}
                    onPress={() => toggleLocation(loc.id)}
                  />
                ))}
              </View>
            </View>
          ) : null}
          {showServicePicker ? (
            <View style={twStyle("mb-4")}>
              <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>{wl("servicesOffered")}</Text>
              <View style={twStyle("rounded-xl border border-gray-200 bg-gray-50")}>
                {serviceOptions.map((svc, i) => {
                  const isSelected = selectedServiceIds.includes(svc.id);
                  return (
                    <TouchableOpacity
                      key={svc.id}
                      style={twStyle(
                        `flex-row items-center px-4 py-3 ${i < serviceOptions.length - 1 ? "border-b border-gray-100" : ""}`,
                      )}
                      onPress={() => toggleService(svc.id)}
                    >
                      <Ionicons
                        name={isSelected ? "checkbox" : "square-outline"}
                        size={20}
                        color={isSelected ? "#6366f1" : "#9ca3af"}
                      />
                      <Text style={twStyle("ms-3 flex-1 text-sm text-gray-900")}>{svc.title}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={twStyle("mt-2 text-xs text-gray-500")}>{wl("servicesDefaultAll")}</Text>
            </View>
          ) : null}
        </ScrollView>
      ) : (
        <View>
          <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>{wl("hoursSource")}</Text>
          <View style={twStyle("mb-3 flex-row flex-wrap")}>
            <Chip
              selected={!copyStaffId}
              label={wl("hoursSalon")}
              onPress={() => setCopyStaffId("")}
            />
            {staffOptions.map((s) => (
              <Chip
                key={s.id}
                selected={copyStaffId === s.id}
                label={wl("hoursCopyFrom", { name: s.name })}
                onPress={() => setCopyStaffId(s.id)}
              />
            ))}
          </View>
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{wl("startDateOptional")}</Text>
          <TouchableOpacity
            style={twStyle("mb-2 rounded-xl border border-gray-200 bg-white px-4 py-3")}
            onPress={() => setShowBookableDatePicker(true)}
          >
            <Text style={twStyle("text-base text-gray-900")}>
              {bookableFrom.trim() || wl("bookableNow")}
            </Text>
          </TouchableOpacity>
          {bookableFrom.trim() ? (
            <TouchableOpacity onPress={() => setBookableFrom("")} style={twStyle("mb-2")}>
              <Text style={twStyle("mb-3 text-sm text-indigo-600")}>{wl("bookableNow")}</Text>
            </TouchableOpacity>
          ) : null}
          {showBookableDatePicker ? (
            <DateTimePicker
              value={
                bookableFrom.trim()
                  ? new Date(`${bookableFrom.trim()}T12:00:00`)
                  : new Date()
              }
              mode="date"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={(_, selected) => {
                setShowBookableDatePicker(Platform.OS === "ios");
                if (selected) setBookableFrom(formatLocalYmd(selected));
              }}
            />
          ) : null}
          <View style={twStyle("mt-2 flex-row items-center justify-between")}>
            <Text style={twStyle("text-sm text-gray-800")}>{wl("timeClock")}</Text>
            <Switch value={timeClock} onValueChange={setTimeClock} />
          </View>
        </View>
      )}

      {!ready ? (
        <View style={twStyle("mt-4 flex-row gap-2")}>
          {step > 0 ? (
            <ActionButton label={wl("back")} variant="secondary" onPress={() => setStep((s) => s - 1)} />
          ) : (
            <ActionButton label={wl("cancel")} variant="secondary" onPress={onClose} />
          )}
          {step < 3 ? (
            <ActionButton label={wl("next")} onPress={goToNextStep} />
          ) : (
            <ActionButton label={wl("addAndInvite")} loading={submitting} onPress={() => void submit()} />
          )}
        </View>
      ) : null}
    </BottomSheet>
  );
}

function Field({
  label,
  value,
  onChangeText,
  keyboardType,
  placeholder,
  maxLength,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  keyboardType?: "email-address" | "numeric" | "default";
  placeholder?: string;
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
        placeholder={placeholder}
        autoCapitalize="none"
        maxLength={maxLength}
      />
    </View>
  );
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[
        twStyle(`rounded-full px-4 py-2 ${selected ? "bg-gray-900" : "border border-gray-200 bg-white"}`),
        { marginEnd: 8, marginBottom: 8 },
      ]}
      onPress={onPress}
    >
      <Text style={twStyle(`text-sm ${selected ? "text-white" : "text-gray-700"}`)}>{label}</Text>
    </TouchableOpacity>
  );
}
