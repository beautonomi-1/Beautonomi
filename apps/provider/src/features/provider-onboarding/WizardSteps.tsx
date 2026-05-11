import { useEffect, useRef, useState } from "react";
import * as Location from "expo-location";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Switch,
  Alert,
  Modal,
  Image,
  useWindowDimensions,
  Platform,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/lib/api-client";
import { supabase } from "@/lib/supabase/client";
import {
  isCompleteSupabaseSmsOtp,
  normalizeSupabaseAuthPhone,
  normalizeSupabaseSmsOtpToken,
  SUPABASE_AUTH_OTP_LENGTH,
} from "@/lib/supabase-sms-otp";
import {
  COUNTRY_CODES,
  type CountryCodeOption,
  composeE164FromNational,
  splitPhoneForNationalInput,
  validateNationalPhoneDigits,
} from "@/lib/phone-country-codes";
import {
  appendFormDataFileNative,
  countryFilterIso2FromStorage,
  resolveGlobalCategoryIconUri,
} from "@beautonomi/utils";
import { getDeviceDefaultCountryDial } from "@/lib/phone";
import { AddressAutocomplete, type ParsedAddress } from "@/components/ui/AddressAutocomplete";
import { StaticMapImage } from "@/components/ui/StaticMapImage";
import { AddressMapPinModal } from "@/components/AddressMapPinModal";
import { reverseGeocodeCoordinates } from "@/lib/reverse-geocode-address";
import { OtpDigitRow } from "@/components/OtpDigitRow";
import { twStyle } from "@/lib/twStyle";
import { Colors } from "@/constants/colors";
import { APP_URL } from "@/config/public-env";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import { verticalFlatListPerf } from "@/lib/flatListPerformance";
import { useOnboardingWizard } from "./OnboardingWizardContext";
import { coerceOwnerPhoneToE164ForForm, isValidOwnerPhoneE164 } from "./onboarding-phone";
import { DEFAULT_COUNTRY_NAME } from "./state";
import type { BusinessType, OnboardingService, TeamSize, YocoMachine } from "./types";

const labelCls = "mb-1 text-xs font-semibold text-gray-700";
const inputCls =
  "rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900";

function Step1TeamSize() {
  const { formData, updateFormData } = useOnboardingWizard();
  const opts: { id: TeamSize; title: string; sub: string }[] = [
    { id: "freelancer", title: "Solo / freelancer", sub: "Just me" },
    { id: "small", title: "Small team", sub: "2–10 people" },
    { id: "medium", title: "Medium team", sub: "11–20 people" },
    { id: "large", title: "Large team", sub: "20+ people" },
  ];
  return (
    <View style={twStyle("gap-3")}>
      <Text style={twStyle("text-sm text-gray-600")}>
        We use this to tailor payroll questions and defaults. You can still run salon, mobile, or both later.
      </Text>
      {opts.map((o) => {
        const sel = formData.team_size === o.id;
        return (
          <TouchableOpacity
            key={o.id}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              updateFormData({
                team_size: o.id,
                business_type: o.id === "freelancer" ? "mobile" : "salon",
              });
            }}
            style={twStyle(
              `rounded-2xl border-2 p-4 ${sel ? "border-primary bg-rose-50" : "border-gray-200 bg-white"}`,
            )}
          >
            <Text style={twStyle("text-base font-semibold text-gray-900")}>{o.title}</Text>
            <Text style={twStyle("mt-1 text-sm text-gray-600")}>{o.sub}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function Step2Identity() {
  const { formData, updateFormData, loadingDraft } = useOnboardingWizard();
  const deviceDial = getDeviceDefaultCountryDial();
  const [countryCode, setCountryCode] = useState("+27");
  const [national, setNational] = useState("");
  const phoneFieldsSeeded = useRef(false);
  const [countryModal, setCountryModal] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [pendingE164, setPendingE164] = useState("");
  /** Resend cooldown (seconds) — 30s, same as the login screen. NOT the full OTP expiry. */
  const RESEND_COOLDOWN_SECS = 30;
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  useEffect(() => {
    if (loadingDraft || phoneFieldsSeeded.current) return;
    phoneFieldsSeeded.current = true;
    const sp = splitPhoneForNationalInput(formData.owner_phone || "", deviceDial);
    setCountryCode(sp.countryCode);
    setNational(sp.nationalDisplay);
  }, [loadingDraft, formData.owner_phone, deviceDial]);

  useEffect(() => {
    const e164 = composeE164FromNational(countryCode, national);
    const next = e164 ? normalizeSupabaseAuthPhone(e164) : "";
    if (next !== (formData.owner_phone || "")) {
      updateFormData({ owner_phone: next, phone_verified: false });
      setCodeSent(false);
      setOtp("");
      setPendingE164("");
    }
  }, [countryCode, national, formData.owner_phone, updateFormData]);

  const sendCode = async () => {
    const e164 = coerceOwnerPhoneToE164ForForm(formData.owner_phone) || composeE164FromNational(countryCode, national);
    const normalized = e164 ? normalizeSupabaseAuthPhone(e164) : "";
    if (!normalized || !isValidOwnerPhoneE164(normalized)) {
      Alert.alert("Phone", "Enter a valid mobile number.");
      return;
    }
    const err = validateNationalPhoneDigits(national, countryCode);
    if (err) {
      Alert.alert("Phone", err);
      return;
    }
    setSending(true);
    try {
      const { error } = await supabase.auth.updateUser({ phone: normalized });
      if (error) throw error;
      setPendingE164(normalized);
      setOtp("");
      setCodeSent(true);
      setResendCooldown(RESEND_COOLDOWN_SECS);
      Alert.alert("Code sent", `We sent a ${SUPABASE_AUTH_OTP_LENGTH}-digit code to your phone.`);
    } catch (e) {
      Alert.alert("Could not send code", e instanceof Error ? e.message : "Try again.");
    } finally {
      setSending(false);
    }
  };

  const verify = async (codeOverride?: string) => {
    const token = normalizeSupabaseSmsOtpToken(codeOverride ?? otp);
    if (!pendingE164 || !isCompleteSupabaseSmsOtp(token)) {
      Alert.alert("Code", `Enter the ${SUPABASE_AUTH_OTP_LENGTH}-digit code from SMS.`);
      return;
    }
    setVerifying(true);
    try {
      const phone = normalizeSupabaseAuthPhone(pendingE164);
      const { error } = await supabase.auth.verifyOtp({
        phone,
        token,
        type: "phone_change",
      });
      if (error) throw error;
      const patchRes = await api.patch("/api/me/profile", { phone, phone_verified: true });
      if (patchRes.error) throw new Error("Phone verified but could not save to profile. Please try again.");
      updateFormData({
        phone_verified: true,
        owner_phone: phone,
        phone: phone,
      });
      Alert.alert("Verified", "Phone number verified.");
    } catch (e) {
      Alert.alert("Verification failed", e instanceof Error ? e.message : "Try again.");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <View style={twStyle("gap-4")}>
      <View>
        <Text style={twStyle(labelCls)}>Full name</Text>
        <Text style={twStyle("text-xs text-gray-500 mb-2 leading-relaxed")}>
          If you signed up with phone, email code, or Google, add the name clients should see — you can change it anytime.
        </Text>
        <TextInput
          value={formData.owner_name || ""}
          onChangeText={(t) => updateFormData({ owner_name: t })}
          placeholder="Your name"
          placeholderTextColor="#9ca3af"
          style={twStyle(inputCls)}
        />
      </View>
      <View>
        <Text style={twStyle(labelCls)}>Email</Text>
        <TextInput
          value={formData.owner_email || ""}
          onChangeText={(t) => updateFormData({ owner_email: t })}
          placeholder="you@example.com"
          placeholderTextColor="#9ca3af"
          keyboardType="email-address"
          autoCapitalize="none"
          style={twStyle(inputCls)}
        />
      </View>
      <View>
        <Text style={twStyle(labelCls)}>Mobile</Text>
        <View style={twStyle("flex-row gap-2")}>
          <TouchableOpacity
            onPress={() => setCountryModal(true)}
            style={twStyle("justify-center rounded-xl border border-gray-200 bg-gray-50 px-3")}
          >
            <Text style={twStyle("font-medium text-gray-800")}>
              {countryCode.startsWith("+") ? countryCode : `+${countryCode}`}
            </Text>
          </TouchableOpacity>
          <TextInput
            value={national}
            onChangeText={(t) => {
              setNational(t.replace(/[^\d\s]/g, ""));
            }}
            placeholder="82 123 4567"
            placeholderTextColor="#9ca3af"
            keyboardType="phone-pad"
            style={twStyle(`${inputCls} flex-1`)}
          />
        </View>
        <Modal visible={countryModal} animationType="slide" presentationStyle="pageSheet">
          <View style={twStyle("flex-1 bg-white p-4 pt-12")}>
            <Text style={twStyle("text-lg font-semibold text-gray-900")}>Country code</Text>
            <TextInput
              value={countrySearch}
              onChangeText={setCountrySearch}
              placeholder="Search…"
              style={twStyle("mt-3 rounded-xl border border-gray-200 px-3 py-2")}
            />
            <FlatList<CountryCodeOption>
              {...verticalFlatListPerf}
              data={COUNTRY_CODES.filter(
                (c: CountryCodeOption) =>
                  !countrySearch.trim() ||
                  c.label.toLowerCase().includes(countrySearch.toLowerCase()) ||
                  c.code.replace(/\D/g, "").includes(countrySearch.replace(/\D/g, "")),
              )}
              keyExtractor={(c: CountryCodeOption) => c.code}
              style={twStyle("mt-4 flex-1")}
              renderItem={({ item: c }: { item: CountryCodeOption }) => (
                <TouchableOpacity
                  style={twStyle("border-b border-gray-100 py-3")}
                  onPress={() => {
                    setCountryCode(c.code);
                    setCountryModal(false);
                    setCountrySearch("");
                  }}
                >
                  <Text style={twStyle("text-base text-gray-900")}>
                    {c.flag} {c.label}
                  </Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity onPress={() => setCountryModal(false)} style={twStyle("py-3 items-center")}>
              <Text style={twStyle("font-medium text-primary")}>Close</Text>
            </TouchableOpacity>
          </View>
        </Modal>
        {/* Only show the send-code flow when not yet verified */}
        {!formData.phone_verified ? (
          <TouchableOpacity
            onPress={sendCode}
            disabled={sending || resendCooldown > 0}
            style={twStyle("mt-3 rounded-xl bg-gray-900 py-3 items-center")}
          >
            <Text style={twStyle("font-semibold text-white")}>
              {sending
                ? "Sending…"
                : resendCooldown > 0
                  ? `Resend in ${resendCooldown}s`
                  : codeSent
                    ? "Resend code"
                    : "Send verification code"}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {codeSent && !formData.phone_verified ? (
        <View>
          <Text style={twStyle(labelCls)}>Verification code</Text>
          <OtpDigitRow
            value={otp}
            onChange={setOtp}
            onComplete={(code) => {
              if (!verifying) void verify(code);
            }}
            disabled={verifying}
            autoFocus
            accessibilityLabelPrefix="Phone verification"
          />
          <TouchableOpacity
            onPress={() => void verify()}
            disabled={verifying}
            style={twStyle("mt-4 rounded-xl bg-primary py-3 items-center")}
          >
            {verifying ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={twStyle("font-semibold text-white")}>Verify</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : null}
      {formData.phone_verified ? (
        <View style={twStyle("flex-row items-center gap-2 rounded-xl border border-green-200 bg-green-50 p-3")}>
          <Ionicons name="checkmark-circle" size={22} color="#16a34a" />
          <Text style={twStyle("text-sm font-medium text-green-900")}>Phone verified</Text>
          <TouchableOpacity
            onPress={() => {
              updateFormData({ phone_verified: false });
              setCodeSent(false);
              setOtp("");
              setPendingE164("");
              setResendCooldown(0);
            }}
            style={twStyle("ml-auto")}
            accessibilityRole="button"
            accessibilityLabel="Change phone number"
          >
            <Text style={twStyle("text-xs font-semibold text-gray-500")}>Change</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

function Step3Business() {
  const { formData, updateFormData } = useOnboardingWizard();
  const types: { id: BusinessType; label: string }[] = [
    { id: "salon", label: "Salon / studio" },
    { id: "mobile", label: "Mobile / at-home" },
    { id: "both", label: "Both" },
  ];
  return (
    <View style={twStyle("gap-4")}>
      <View>
        <Text style={twStyle(labelCls)}>Business name</Text>
        <TextInput
          value={formData.business_name || ""}
          onChangeText={(t) => updateFormData({ business_name: t })}
          placeholder="Shown to clients"
          placeholderTextColor="#9ca3af"
          style={twStyle(inputCls)}
        />
      </View>
      <Text style={twStyle(labelCls)}>Business type</Text>
      {types.map((t) => {
        const sel = formData.business_type === t.id;
        return (
          <TouchableOpacity
            key={t.id}
            onPress={() => updateFormData({ business_type: t.id })}
            style={twStyle(
              `rounded-2xl border-2 p-4 ${sel ? "border-primary bg-rose-50" : "border-gray-200 bg-white"}`,
            )}
          >
            <Text style={twStyle("text-base font-semibold text-gray-900")}>{t.label}</Text>
          </TouchableOpacity>
        );
      })}
      <View>
        <Text style={twStyle(labelCls)}>Description (recommended)</Text>
        <TextInput
          value={formData.description || ""}
          onChangeText={(t) => updateFormData({ description: t })}
          placeholder="What you offer and what makes you unique"
          placeholderTextColor="#9ca3af"
          multiline
          numberOfLines={4}
          style={twStyle(`${inputCls} min-h-[100px]`)}
        />
      </View>
    </View>
  );
}

function Step4Payment() {
  const { formData, updateFormData } = useOnboardingWizard();
  const yoco: { id: YocoMachine; t: string }[] = [
    { id: "yes", t: "Yes, I have Yoco" },
    { id: "no", t: "No — I want one" },
    { id: "other", t: "Other card machine" },
  ];
  return (
    <View style={twStyle("gap-4")}>
      <Text style={twStyle(labelCls)}>Yoco card machine</Text>
      {yoco.map((o) => (
        <TouchableOpacity
          key={o.id}
          onPress={() => updateFormData({ yoco_machine: o.id })}
          style={twStyle(
            `rounded-2xl border-2 p-4 ${formData.yoco_machine === o.id ? "border-primary bg-rose-50" : "border-gray-200 bg-white"}`,
          )}
        >
          <Text style={twStyle("text-base font-semibold text-gray-900")}>{o.t}</Text>
        </TouchableOpacity>
      ))}
      {formData.yoco_machine === "other" ? (
        <TextInput
          value={formData.yoco_machine_other || ""}
          onChangeText={(t) => updateFormData({ yoco_machine_other: t })}
          placeholder="Which device?"
          placeholderTextColor="#9ca3af"
          style={twStyle(inputCls)}
        />
      ) : null}
      <View style={twStyle("rounded-2xl border-2 border-gray-200 bg-white p-4 gap-3")}>
        <View style={twStyle("flex-row items-center justify-between gap-3")}>
          <View style={twStyle("flex-1 pr-1")}>
            <Text style={twStyle("text-base font-semibold text-gray-900")}>VAT registered (SARS)</Text>
            <Text style={twStyle("mt-1 text-sm text-gray-600")}>
              Turn on if you have a VAT number for invoices and tax.
            </Text>
          </View>
          <Switch
            value={formData.is_vat_registered === true}
            onValueChange={(v) => updateFormData({ is_vat_registered: v, vat_number: v ? formData.vat_number : undefined })}
          />
        </View>
        {formData.is_vat_registered ? (
          <TextInput
            value={formData.vat_number || ""}
            onChangeText={(t) => updateFormData({ vat_number: t.replace(/\D/g, "").slice(0, 10) })}
            placeholder="10-digit VAT number"
            placeholderTextColor="#9ca3af"
            keyboardType="number-pad"
            style={twStyle(inputCls)}
          />
        ) : null}
      </View>
    </View>
  );
}

function Step5Software() {
  const { formData, updateFormData } = useOnboardingWizard();
  return (
    <View style={twStyle("gap-3")}>
      <Text style={twStyle("text-sm text-gray-600")}>
        Optional — helps us understand where providers are coming from.
      </Text>
      <View style={twStyle("rounded-2xl border-2 border-gray-200 bg-white p-4 gap-2")}>
        <Text style={twStyle(labelCls)}>Previous booking software</Text>
        <Text style={twStyle("text-sm text-gray-600")}>
          {`Type a product name or "none" if you're new to software.`}
        </Text>
        <TextInput
          value={
            formData.previous_software === "other"
              ? formData.previous_software_other || ""
              : formData.previous_software || ""
          }
          onChangeText={(t) => {
            const slug = t.toLowerCase().replace(/\s+/g, "_").slice(0, 80);
            updateFormData({ previous_software: slug || undefined, previous_software_other: undefined });
          }}
          placeholder="e.g. Fresha, Vagaro, or None"
          placeholderTextColor="#9ca3af"
          style={twStyle(inputCls)}
        />
      </View>
    </View>
  );
}

function Step6Payroll() {
  const { formData, updateFormData } = useOnboardingWizard();
  const opts = ["commission", "hourly", "both", "other"] as const;
  return (
    <View style={twStyle("gap-3")}>
      <Text style={twStyle("text-sm text-gray-600")}>
        How you usually compensate staff or contractors. You can refine this later in settings.
      </Text>
      <Text style={twStyle(labelCls)}>Payroll model</Text>
      {opts.map((o) => (
        <TouchableOpacity
          key={o}
          onPress={() => updateFormData({ payroll_type: o })}
          style={twStyle(
            `rounded-2xl border-2 p-4 capitalize ${formData.payroll_type === o ? "border-primary bg-rose-50" : "border-gray-200 bg-white"}`,
          )}
        >
          <Text style={twStyle("text-base font-semibold text-gray-900")}>{o}</Text>
        </TouchableOpacity>
      ))}
      <View style={twStyle("rounded-2xl border-2 border-gray-200 bg-white p-4 gap-2")}>
        <Text style={twStyle(labelCls)}>Optional details</Text>
        <Text style={twStyle("text-sm text-gray-600")}>Anything we should know about schedules, splits, or tools.</Text>
        <TextInput
          value={formData.payroll_details || ""}
          onChangeText={(t) => updateFormData({ payroll_details: t })}
          placeholder="Optional details"
          placeholderTextColor="#9ca3af"
          style={twStyle(inputCls)}
        />
      </View>
    </View>
  );
}

function Step7Location() {
  const { formData, updateFormData } = useOnboardingWizard();
  const { width: windowWidth } = useWindowDimensions();
  const [mapPinOpen, setMapPinOpen] = useState(false);
  const [locating, setLocating] = useState(false);

  const addr = formData.address ?? {
    line1: "",
    city: "",
    state: "",
    postal_code: "",
    country: DEFAULT_COUNTRY_NAME,
  };
  const mapboxCountry =
    countryFilterIso2FromStorage(addr.country || DEFAULT_COUNTRY_NAME) ?? "ZA";

  const onSelect = (p: ParsedAddress) => {
    updateFormData({
      address: {
        ...addr,
        line1: p.address_line1,
        city: p.city,
        state: p.state,
        postal_code: p.postal_code,
        country: p.country || DEFAULT_COUNTRY_NAME,
        latitude: p.latitude,
        longitude: p.longitude,
      },
    });
  };

  const handleUseCurrentLocation = async () => {
    if (locating) return;
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Location", "Allow location access to set your address from your current position.");
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
      const lat = loc.coords.latitude;
      const lng = loc.coords.longitude;
      const defaultCountry = addr.country?.trim() || DEFAULT_COUNTRY_NAME;
      const mapped = await reverseGeocodeCoordinates(lat, lng, defaultCountry);
      if (mapped) {
        updateFormData({
          address: {
            ...addr,
            line1: mapped.address_line1 || addr.line1 || "Current location",
            city: mapped.city || addr.city || "",
            state: mapped.state || addr.state || "",
            postal_code: mapped.postal_code || addr.postal_code || "",
            country: mapped.country || defaultCountry,
            latitude: mapped.latitude,
            longitude: mapped.longitude,
          },
        });
      } else {
        updateFormData({
          address: {
            ...addr,
            latitude: lat,
            longitude: lng,
          },
        });
      }
    } catch (e) {
      Alert.alert("Location error", e instanceof Error ? e.message : "Could not read location.");
    } finally {
      setLocating(false);
    }
  };

  const handleDropPinConfirm = async (lat: number, lng: number) => {
    const defaultCountry = addr.country?.trim() || DEFAULT_COUNTRY_NAME;
    const mapped = await reverseGeocodeCoordinates(lat, lng, defaultCountry);
    if (mapped) {
      updateFormData({
        address: {
          ...addr,
          line1: mapped.address_line1 || addr.line1,
          city: mapped.city || addr.city,
          state: mapped.state || addr.state,
          postal_code: mapped.postal_code || addr.postal_code,
          country: mapped.country || defaultCountry,
          latitude: mapped.latitude,
          longitude: mapped.longitude,
        },
      });
    } else {
      updateFormData({
        address: {
          ...addr,
          latitude: lat,
          longitude: lng,
        },
      });
    }
    setMapPinOpen(false);
  };

  return (
    <View style={twStyle("gap-4")}>
      <Text style={twStyle("text-sm text-gray-600")}>
        Search for your street, drop a pin on the map, or use current location — we save coordinates for zones and travel.
      </Text>
      <AddressAutocomplete
        value={addr.line1 || ""}
        onSelect={onSelect}
        onBlur={(q) => {
          if (q.trim()) {
            updateFormData({
              address: { ...addr, line1: q.trim(), country: addr.country || DEFAULT_COUNTRY_NAME },
            });
          }
        }}
        label="Street address"
        countryCode={mapboxCountry}
        defaultCountryName={DEFAULT_COUNTRY_NAME}
        proximity={
          addr.latitude && addr.longitude
            ? { latitude: addr.latitude, longitude: addr.longitude }
            : undefined
        }
      />
      <View style={twStyle("flex-row flex-wrap gap-2")}>
        <TouchableOpacity
          onPress={() => void handleUseCurrentLocation()}
          disabled={locating}
          style={twStyle(
            `rounded-full border px-3 py-2 flex-row items-center ${locating ? "border-gray-200 bg-gray-100" : "border-blue-200 bg-blue-50"}`,
          )}
          accessibilityRole="button"
          accessibilityLabel="Use current location"
        >
          {locating ? (
            <ActivityIndicator size="small" color="#2563eb" />
          ) : (
            <Ionicons name="locate-outline" size={16} color="#2563eb" />
          )}
          <Text style={twStyle("ml-1.5 text-xs font-semibold text-blue-700")}>
            {locating ? "Locating…" : "Current location"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setMapPinOpen(true)}
          style={twStyle("rounded-full border border-gray-200 bg-white px-3 py-2 flex-row items-center")}
          accessibilityRole="button"
          accessibilityLabel="Drop pin on map"
        >
          <Ionicons name="map-outline" size={16} color="#374151" />
          <Text style={twStyle("ml-1.5 text-xs font-semibold text-gray-700")}>Drop pin on map</Text>
        </TouchableOpacity>
      </View>

      {addr.latitude != null && addr.longitude != null ? (
        <View style={twStyle("items-center")}>
          <StaticMapImage
            latitude={addr.latitude}
            longitude={addr.longitude}
            width={Math.min(windowWidth - 48, 400)}
            height={140}
            zoom={15}
          />
          <Text style={twStyle("mt-1.5 text-center text-xs text-gray-500")}>Map preview · edit lines below if needed</Text>
        </View>
      ) : null}

      <View>
        <Text style={twStyle(labelCls)}>Apt / suite (optional)</Text>
        <TextInput
          value={addr.line2 || ""}
          onChangeText={(t) => updateFormData({ address: { ...addr, line2: t || undefined } })}
          style={twStyle(inputCls)}
        />
      </View>
      <View>
        <Text style={twStyle(labelCls)}>City</Text>
        <TextInput
          value={addr.city || ""}
          onChangeText={(t) => updateFormData({ address: { ...addr, city: t } })}
          style={twStyle(inputCls)}
        />
      </View>
      <View>
        <Text style={twStyle(labelCls)}>Country</Text>
        <TextInput
          value={addr.country || ""}
          onChangeText={(t) => updateFormData({ address: { ...addr, country: t } })}
          style={twStyle(inputCls)}
        />
      </View>

      <AddressMapPinModal
        visible={mapPinOpen}
        onClose={() => setMapPinOpen(false)}
        onPickCoordinates={(lat, lng) => {
          void handleDropPinConfirm(lat, lng);
        }}
        initialCoordinate={
          addr.latitude != null && addr.longitude != null
            ? { latitude: addr.latitude, longitude: addr.longitude }
            : null
        }
      />
    </View>
  );
}

async function uploadOnboardingImage(uri: string, mime: string, name: string): Promise<string | null> {
  const formData = new FormData();
  appendFormDataFileNative(formData, "file", { uri, type: mime, name });
  formData.append("folder", "provider-onboarding");
  const res = await api.fetch<{ url?: string }>("/api/upload", {
    method: "POST",
    body: formData,
  });
  if (res.error || !res.data?.url) return null;
  return res.data.url;
}

function Step8Photos() {
  const { formData, updateFormData } = useOnboardingWizard();
  /**
   * §Provider-onboarding 2026-04 (photos UX polish): previously tapping
   * any of the three upload buttons spun silently (no feedback, no
   * preview), and the user had no way to tell if the upload succeeded
   * or even started. Now we track per-slot upload state and show the
   * uploaded image so the provider can visually confirm + remove.
   */
  const [uploading, setUploading] = useState<{ thumb: boolean; avatar: boolean; gallery: boolean }>(
    { thumb: false, avatar: false, gallery: false },
  );

  const pick = async (kind: "thumb" | "avatar" | "gallery") => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission", "Allow photo access to upload.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: kind !== "gallery",
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    const a = result.assets[0];
    setUploading((p) => ({ ...p, [kind]: true }));
    try {
      const url = await uploadOnboardingImage(
        a.uri,
        a.mimeType || "image/jpeg",
        a.fileName || `img-${Date.now()}.jpg`,
      );
      if (!url) {
        Alert.alert("Upload failed", "Try again.");
        return;
      }
      if (kind === "thumb") updateFormData({ thumbnail_url: url });
      else if (kind === "avatar") updateFormData({ avatar_url: url });
      else updateFormData({ gallery: [...(formData.gallery || []), url] });
    } finally {
      setUploading((p) => ({ ...p, [kind]: false }));
    }
  };

  const removeGalleryAt = (idx: number) => {
    const cur = formData.gallery || [];
    const next = cur.filter((_, i) => i !== idx);
    updateFormData({ gallery: next });
  };

  const thumbUrl = formData.thumbnail_url;
  const avatarUrl = formData.avatar_url;
  const gallery = formData.gallery || [];

  const renderSlot = (kind: "thumb" | "avatar", title: string, subtitle: string, url: string | undefined) => (
    <View style={twStyle("rounded-2xl border-2 border-gray-200 bg-white p-4")}>
      <View style={twStyle("flex-row items-center gap-3")}>
        <View
          style={twStyle(
            `h-16 w-16 items-center justify-center overflow-hidden rounded-xl ${url ? "bg-gray-100" : "bg-gray-50 border border-dashed border-gray-300"}`,
          )}
        >
          {url ? (
            <Image source={{ uri: url }} style={{ width: 64, height: 64 }} resizeMode="cover" />
          ) : (
            <Ionicons name="image-outline" size={22} color="#94a3b8" />
          )}
        </View>
        <View style={twStyle("flex-1")}>
          <Text style={twStyle("text-base font-semibold text-gray-900")}>{title}</Text>
          <Text style={twStyle("mt-0.5 text-xs text-gray-600")}>{subtitle}</Text>
        </View>
      </View>
      <View style={twStyle("mt-3 flex-row gap-2")}>
        <TouchableOpacity
          onPress={() => pick(kind)}
          disabled={uploading[kind]}
          style={twStyle(
            `flex-1 rounded-xl py-2.5 items-center ${uploading[kind] ? "bg-gray-100" : url ? "bg-gray-900" : "bg-primary"}`,
          )}
          accessibilityRole="button"
          accessibilityLabel={url ? `Replace ${title}` : `Upload ${title}`}
        >
          {uploading[kind] ? (
            <ActivityIndicator color="#6b7280" size="small" />
          ) : (
            <Text style={twStyle("text-sm font-semibold text-white")}>{url ? "Replace" : "Choose photo"}</Text>
          )}
        </TouchableOpacity>
        {url ? (
          <TouchableOpacity
            onPress={() => {
              if (kind === "thumb") updateFormData({ thumbnail_url: undefined });
              else updateFormData({ avatar_url: undefined });
            }}
            style={twStyle("rounded-xl border border-gray-200 bg-white px-4 items-center justify-center")}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${title}`}
          >
            <Ionicons name="trash-outline" size={18} color="#dc2626" />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );

  return (
    <View style={twStyle("gap-3")}>
      <Text style={twStyle("text-sm text-gray-600")}>Optional — you can add these later in settings.</Text>
      {renderSlot("thumb", "Main business photo", "Shown on your listing", thumbUrl)}
      {renderSlot("avatar", "Profile / avatar", "How you appear to clients", avatarUrl)}

      <View style={twStyle("rounded-2xl border-2 border-gray-200 bg-white p-4 gap-3")}>
        <View style={twStyle("flex-row items-center justify-between")}>
          <View style={twStyle("flex-1 pr-2")}>
            <Text style={twStyle("text-base font-semibold text-gray-900")}>Gallery</Text>
            <Text style={twStyle("mt-0.5 text-xs text-gray-600")}>
              Portfolio-style photos. {gallery.length > 0 ? `${gallery.length} added.` : "None yet."}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => pick("gallery")}
            disabled={uploading.gallery}
            style={twStyle(
              `rounded-xl px-4 py-2.5 ${uploading.gallery ? "bg-gray-100" : "bg-primary"}`,
            )}
            accessibilityRole="button"
            accessibilityLabel="Add gallery photo"
          >
            {uploading.gallery ? (
              <ActivityIndicator color="#6b7280" size="small" />
            ) : (
              <Text style={twStyle("text-sm font-semibold text-white")}>Add</Text>
            )}
          </TouchableOpacity>
        </View>
        {gallery.length > 0 ? (
          <View style={twStyle("flex-row flex-wrap gap-2")}>
            {gallery.map((url, idx) => (
              <View
                key={`${url}-${idx}`}
                style={{ position: "relative", width: 72, height: 72 }}
              >
                <Image
                  source={{ uri: url }}
                  style={{ width: 72, height: 72, borderRadius: 10 }}
                  resizeMode="cover"
                />
                <TouchableOpacity
                  onPress={() => removeGalleryAt(idx)}
                  hitSlop={8}
                  style={{
                    position: "absolute",
                    top: -6,
                    right: -6,
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    backgroundColor: "#ef4444",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove gallery image ${idx + 1}`}
                >
                  <Ionicons name="close" size={14} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

type ZoneRow = { id: string; name: string; zone_type: string; match_reason?: string };

function Step9Zones() {
  const { formData, updateFormData } = useOnboardingWizard();
  const [zones, setZones] = useState<ZoneRow[]>([]);
  const [loading, setLoading] = useState(true);
  // Track whether we have already auto-selected zones so that updating
  // `selected_zone_ids` doesn't re-trigger the suggest-zones API call.
  const autoSelectedRef = useRef(false);

  useEffect(() => {
    const lat = formData.address?.latitude;
    const lng = formData.address?.longitude;
    if (lat == null || lng == null) {
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      const hadZones = (formData.selected_zone_ids?.length ?? 0) > 0;
      try {
        const res = await api.post<{ suggested_zones: ZoneRow[] }>("/api/provider/onboarding/suggest-zones", {
          address: formData.address?.line1 || "",
          latitude: lat,
          longitude: lng,
          city: formData.address?.city || "",
          postal_code: formData.address?.postal_code || "",
          country: formData.address?.country || "",
        });
        const list = res.data?.suggested_zones ?? [];
        setZones(list);
        if (list.length && !hadZones && !autoSelectedRef.current) {
          autoSelectedRef.current = true;
          updateFormData({ selected_zone_ids: list.map((z) => z.id) });
        }
      } catch {
        setZones([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [
    formData.address?.latitude,
    formData.address?.longitude,
    formData.address?.line1,
    formData.address?.city,
    formData.address?.postal_code,
    formData.address?.country,
    // Intentionally omit `formData.selected_zone_ids?.length` — updating it
    // after auto-selection must not re-trigger a zones fetch.
    updateFormData,
  ]);

  if (loading) {
    return (
      <View style={twStyle("py-8 items-center")}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  if (!zones.length) {
    return <Text style={twStyle("text-sm text-gray-600")}>No zones matched. You can configure zones later.</Text>;
  }

  const toggle = (id: string) => {
    const cur = formData.selected_zone_ids || [];
    if (cur.includes(id)) updateFormData({ selected_zone_ids: cur.filter((x) => x !== id) });
    else updateFormData({ selected_zone_ids: [...cur, id] });
  };

  const selectedIds = formData.selected_zone_ids || [];

  return (
    <FlatList<ZoneRow>
      {...verticalFlatListPerf}
      data={zones}
      keyExtractor={(z: ZoneRow) => z.id}
      scrollEnabled={false}
      renderItem={({ item }: { item: ZoneRow }) => {
        const on = selectedIds.includes(item.id);
        return (
          <TouchableOpacity
            onPress={() => toggle(item.id)}
            style={twStyle(
              `mb-3 rounded-2xl border-2 p-4 ${on ? "border-primary bg-rose-50" : "border-gray-200 bg-white"}`,
            )}
          >
            <Text style={twStyle("text-base font-semibold text-gray-900")}>{item.name}</Text>
            {item.match_reason ? (
              <Text style={twStyle("mt-1 text-xs text-sky-800")}>{item.match_reason}</Text>
            ) : null}
          </TouchableOpacity>
        );
      }}
    />
  );
}

type Cat = { id: string; name: string; icon?: string };

function Step10Categories() {
  const { formData, updateFormData } = useOnboardingWizard();
  const [cats, setCats] = useState<Cat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const res = await api.get<Cat[]>("/api/public/categories/global?all=true");
      setCats(Array.isArray(res.data) ? res.data : []);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <View style={twStyle("py-8 items-center")}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  const toggle = (id: string) => {
    const cur = formData.global_category_ids || [];
    if (cur.includes(id)) updateFormData({ global_category_ids: cur.filter((x) => x !== id) });
    else updateFormData({ global_category_ids: [...cur, id] });
  };

  return (
    <FlatList<Cat>
      {...verticalFlatListPerf}
      data={cats}
      keyExtractor={(c: Cat) => c.id}
      numColumns={2}
      columnWrapperStyle={twStyle("gap-2")}
      scrollEnabled={false}
      renderItem={({ item }: { item: Cat }) => {
        const on = (formData.global_category_ids || []).includes(item.id);
        const iconUri = resolveGlobalCategoryIconUri(item.icon, APP_URL);
        return (
          <TouchableOpacity
            onPress={() => toggle(item.id)}
            style={twStyle(
              `mb-3 flex-1 rounded-2xl border-2 p-4 ${on ? "border-primary bg-rose-50" : "border-gray-200 bg-white"}`,
            )}
          >
            <View style={twStyle("h-8 w-8 items-center justify-center")}>
              {iconUri ? (
                <Image
                  source={{ uri: iconUri }}
                  style={{ width: 28, height: 28 }}
                  resizeMode="contain"
                  accessibilityIgnoresInvertColors
                />
              ) : (
                <Ionicons
                  name="pricetag-outline"
                  size={22}
                  color={on ? Colors.primary : "#64748b"}
                />
              )}
            </View>
            <Text style={twStyle("mt-1 text-base font-semibold text-gray-900")} numberOfLines={2}>
              {item.name}
            </Text>
          </TouchableOpacity>
        );
      }}
    />
  );
}

function Step11Services() {
  const { formData, updateFormData } = useOnboardingWizard();
  const tenantCurrency = getTenantDefaultCurrency();
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [dur, setDur] = useState("60");
  const services = formData.services || [];

  const add = () => {
    const p = parseFloat(price);
    const d = parseInt(dur, 10) || 60;
    if (!title.trim() || Number.isNaN(p)) {
      Alert.alert("Service", "Enter title and price.");
      return;
    }
    const s: OnboardingService = {
      title: title.trim(),
      duration_minutes: d,
      price: p,
      currency: getTenantDefaultCurrency(),
      supports_at_home: formData.business_type !== "salon",
      supports_at_salon: formData.business_type !== "mobile",
    };
    updateFormData({ services: [...services, s] });
    setTitle("");
    setPrice("");
    setDur("60");
  };

  const remove = (i: number) => {
    const next = [...services];
    next.splice(i, 1);
    updateFormData({ services: next });
  };

  return (
    <View style={twStyle("gap-4")}>
      {services.map((s, i) => (
        <View
          key={`${s.title}-${i}`}
          style={twStyle("flex-row items-center justify-between rounded-2xl border-2 border-gray-200 bg-white p-4")}
        >
          <View style={twStyle("flex-1 pr-2")}>
            <Text style={twStyle("text-base font-semibold text-gray-900")}>{s.title}</Text>
            <Text style={twStyle("text-xs text-gray-600")}>
              {s.duration_minutes} min · {s.currency || tenantCurrency} {s.price}
            </Text>
          </View>
          <TouchableOpacity onPress={() => remove(i)}>
            <Ionicons name="trash-outline" size={22} color="#ef4444" />
          </TouchableOpacity>
        </View>
      ))}
      <View style={twStyle("rounded-2xl border-2 border-gray-200 bg-white p-4 gap-3")}>
        <Text style={twStyle(labelCls)}>Add a service</Text>
        <Text style={twStyle("text-sm text-gray-600")}>You can add more services later in the catalogue.</Text>
        <TextInput value={title} onChangeText={setTitle} placeholder="Name" style={twStyle(inputCls)} />
        <TextInput
          value={price}
          onChangeText={setPrice}
          placeholder={`Price (${tenantCurrency})`}
          keyboardType="decimal-pad"
          style={twStyle(inputCls)}
        />
        <TextInput value={dur} onChangeText={setDur} placeholder="Minutes" keyboardType="number-pad" style={twStyle(inputCls)} />
      </View>
      <TouchableOpacity
        onPress={add}
        style={twStyle("rounded-2xl border-2 border-primary bg-white py-4 items-center")}
      >
        <Text style={twStyle("text-base font-semibold text-primary")}>Add service</Text>
      </TouchableOpacity>
    </View>
  );
}

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

function Step12Hours() {
  const { formData, updateFormData } = useOnboardingWizard();
  const oh = formData.operating_hours || {};
  const isFreelancer = formData.business_type === "mobile" || formData.team_size === "freelancer";

  const [showPicker, setShowPicker] = useState<"open" | "close" | null>(null);
  const [pickerDay, setPickerDay] = useState<string | null>(null);
  const [pickerTime, setPickerTime] = useState<string>("09:00");

  useEffect(() => {
    if (isFreelancer && (!formData.operating_hours || Object.keys(formData.operating_hours).length === 0)) {
      updateFormData({
        operating_hours: {
          monday: { open: "08:00", close: "20:00", closed: false },
          tuesday: { open: "08:00", close: "20:00", closed: false },
          wednesday: { open: "08:00", close: "20:00", closed: false },
          thursday: { open: "08:00", close: "20:00", closed: false },
          friday: { open: "08:00", close: "20:00", closed: false },
          saturday: { open: "09:00", close: "18:00", closed: false },
          sunday: { open: "10:00", close: "16:00", closed: false },
        },
      });
    }
  }, [isFreelancer, formData.operating_hours, updateFormData]);

  const setDay = (day: string, patch: Partial<{ open: string; close: string; closed: boolean }>) => {
    const cur = oh[day] || { open: "09:00", close: "18:00", closed: false };
    updateFormData({
      operating_hours: { ...oh, [day]: { ...cur, ...patch } },
    });
  };

  const handleTimeChange = (_: any, d?: Date) => {
    if (Platform.OS !== "ios") {
      setShowPicker(null);
      setPickerDay(null);
    }
    if (d && pickerDay && showPicker) {
      const timeStr = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      setDay(pickerDay, { [showPicker]: timeStr });
      setPickerTime(timeStr);
    }
  };

  return (
    <View style={twStyle("gap-3")}>
      <View style={twStyle(`rounded-2xl border p-4 ${isFreelancer ? "border-emerald-200 bg-emerald-50" : "border-gray-200 bg-gray-50"}`)}>
        <View style={twStyle("flex-row items-start gap-2")}>
          <Ionicons name="information-circle" size={20} color={isFreelancer ? "#047857" : "#4b5563"} />
          <Text style={twStyle(`flex-1 text-sm leading-5 ${isFreelancer ? "text-emerald-900" : "text-gray-800"}`)}>
            {isFreelancer ? (
              <Text>
                <Text style={twStyle("font-bold")}>Freelancer hours: </Text>
                We started you on broad weekday hours (8:00–20:00); tweak them to match how you actually work. You can change this anytime in Settings.
              </Text>
            ) : (
              <Text>
                <Text style={twStyle("font-bold")}>Location Booking Window: </Text>
                Clients only see slots inside these hours for the salon. You can set individual staff schedules later under Settings.
              </Text>
            )}
          </Text>
        </View>
      </View>

      {DAYS.map((day) => {
        const h = oh[day] || { open: "09:00", close: "18:00", closed: false };
        return (
          <View
            key={day}
            style={twStyle("rounded-2xl border-2 border-gray-200 bg-white p-4")}
          >
            <View style={twStyle("flex-row items-center justify-between")}>
              <Text style={twStyle("w-28 text-base font-semibold capitalize text-gray-900")}>{day}</Text>
              <View style={twStyle("flex-row items-center gap-2")}>
                <Text style={twStyle("text-sm text-gray-600")}>Open</Text>
                <Switch value={!h.closed} onValueChange={(v) => setDay(day, { closed: !v })} />
              </View>
            </View>
            {!h.closed ? (
              <View style={twStyle("mt-3 flex-row gap-2")}>
                <TouchableOpacity
                  onPress={() => {
                    setPickerDay(day);
                    setShowPicker("open");
                    setPickerTime(h.open || "09:00");
                  }}
                  style={twStyle("flex-1 flex-row items-center justify-center rounded-xl border border-gray-200 bg-gray-50 py-3")}
                >
                  <Ionicons name="time-outline" size={16} color="#6b7280" />
                  <Text style={twStyle("ml-2 text-base font-medium text-gray-900")}>{h.open || "09:00"}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    setPickerDay(day);
                    setShowPicker("close");
                    setPickerTime(h.close || "18:00");
                  }}
                  style={twStyle("flex-1 flex-row items-center justify-center rounded-xl border border-gray-200 bg-gray-50 py-3")}
                >
                  <Ionicons name="time-outline" size={16} color="#6b7280" />
                  <Text style={twStyle("ml-2 text-base font-medium text-gray-900")}>{h.close || "18:00"}</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        );
      })}

      {showPicker && pickerDay && (
        <DateTimePicker
          value={new Date(`2000-01-01T${pickerTime}:00`)}
          mode="time"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={handleTimeChange}
        />
      )}
    </View>
  );
}

function Step13Review() {
  const { formData } = useOnboardingWizard();
  const a = formData.address;
  return (
    <View style={twStyle("rounded-2xl border-2 border-gray-200 bg-white p-4 gap-3")}>
      <Text style={twStyle("text-sm text-gray-700")}>
        <Text style={twStyle("font-semibold text-gray-900")}>Business: </Text>
        {formData.business_name}
      </Text>
      <Text style={twStyle("text-sm text-gray-700")}>
        <Text style={twStyle("font-semibold text-gray-900")}>Type: </Text>
        {formData.business_type}
      </Text>
      <Text style={twStyle("text-sm text-gray-700")}>
        <Text style={twStyle("font-semibold text-gray-900")}>Address: </Text>
        {a?.line1}, {a?.city}, {a?.country}
      </Text>
      <Text style={twStyle("text-sm text-gray-700")}>
        <Text style={twStyle("font-semibold text-gray-900")}>Categories: </Text>
        {(formData.global_category_ids || []).length} selected
      </Text>
      <Text style={twStyle("text-sm text-gray-700")}>
        <Text style={twStyle("font-semibold text-gray-900")}>Services: </Text>
        {(formData.services || []).length} added (optional)
      </Text>
    </View>
  );
}

type PlanRow = {
  id: string;
  name: string;
  price: string;
  period: string | null;
  description: string | null;
  is_popular: boolean;
  features: string[];
};

function Step14Plan() {
  const { formData, updateFormData } = useOnboardingWizard();
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  // Capture selected_plan_id at mount time so the fetch effect runs exactly
  // once (on mount) without `formData.selected_plan_id` as a dependency.
  const initialPlanId = useRef(formData.selected_plan_id);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await api.get<PlanRow[] | { plans?: PlanRow[] }>("/api/public/pricing/plans");
        if (!active) return;
        const raw = res.data as PlanRow[] | { plans?: PlanRow[] } | null | undefined;
        const list = Array.isArray(raw)
          ? raw
          : raw && typeof raw === "object" && Array.isArray((raw as { plans?: PlanRow[] }).plans)
            ? (raw as { plans: PlanRow[] }).plans
            : [];
        setPlans(list);
        
        if (list.length === 0) {
          updateFormData({ no_plans_available: true, selected_plan_id: undefined, selected_plan_name: undefined });
        } else if (!initialPlanId.current?.trim()) {
          // Auto-select first plan only when none was previously selected
          updateFormData({ 
            selected_plan_id: list[0].id, 
            selected_plan_name: list[0].name,
            no_plans_available: false 
          });
        } else {
          updateFormData({ no_plans_available: false });
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateFormData]);

  if (loading) {
    return (
      <View style={twStyle("py-8 items-center")}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  if (plans.length === 0) {
    return (
      <View style={twStyle("py-8 items-center")}>
        <Text style={twStyle("text-base text-gray-500 text-center")}>
          No subscription plans available right now. You can continue to the next step.
        </Text>
      </View>
    );
  }

  return (
    <View style={twStyle("gap-3")}>
      {plans.map((p) => {
        const sel = formData.selected_plan_id === p.id;
        return (
          <TouchableOpacity
            key={p.id}
            onPress={() => updateFormData({ selected_plan_id: p.id, selected_plan_name: p.name })}
            style={twStyle(
              `rounded-2xl border-2 p-4 ${sel ? "border-primary bg-rose-50" : "border-gray-200 bg-white"}`,
            )}
          >
            <Text style={twStyle("text-lg font-bold text-gray-900")}>{p.name}</Text>
            <Text style={twStyle("mt-1 text-primary")}>
              {p.price}
              {p.period ? ` ${p.period}` : ""}
            </Text>
            {p.description ? (
              <Text style={twStyle("mt-2 text-sm text-gray-600")}>{p.description}</Text>
            ) : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function OnboardingStepBody() {
  const { currentStep } = useOnboardingWizard();
  switch (currentStep) {
    case 1:
      return <Step1TeamSize />;
    case 2:
      return <Step2Identity />;
    case 3:
      return <Step3Business />;
    case 4:
      return <Step4Payment />;
    case 5:
      return <Step5Software />;
    case 6:
      return <Step6Payroll />;
    case 7:
      return <Step7Location />;
    case 8:
      return <Step8Photos />;
    case 9:
      return <Step9Zones />;
    case 10:
      return <Step10Categories />;
    case 11:
      return <Step11Services />;
    case 12:
      return <Step12Hours />;
    case 13:
      return <Step13Review />;
    case 14:
      return <Step14Plan />;
    default:
      return null;
  }
}
