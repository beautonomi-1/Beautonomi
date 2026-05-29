import { type ComponentProps, useEffect, useMemo, useRef, useState } from "react";
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
  Pressable,
  Image,
  useWindowDimensions,
  Platform,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
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
import { stripHtmlToPlainText } from "@/lib/htmlPlainText";
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
import { ensureForegroundLocationPermission } from "@/lib/native-permissions";
import { useImagePicker } from "@/hooks/useImagePicker";
import { useOnboardingWizard } from "./OnboardingWizardContext";
import { coerceOwnerPhoneToE164ForForm, isValidOwnerPhoneE164 } from "./onboarding-phone";
import { DEFAULT_COUNTRY_NAME } from "./state";
import type { BusinessType, OnboardingService, OnboardingServiceAddon, TeamSize, YocoMachine } from "./types";
import { PricingOptionsEditor } from "@/features/catalogue/PricingOptionsEditor";
import { DEFAULT_PRICING_OPTION, pricingOptionsToPayload, type PricingOption } from "@/features/catalogue/types";

const labelCls = "mb-1.5 text-[13px] font-semibold tracking-wide text-slate-800";
const inputCls =
  "rounded-[1.5rem] border border-slate-200 bg-white px-5 py-4 text-base text-slate-900 shadow-sm";

// ─── Step 1: Team size ───────────────────────────────────────────────────────

type TeamSizeOpt = {
  id: TeamSize;
  title: string;
  sub: string;
  icon: ComponentProps<typeof Ionicons>["name"];
};

function Step1TeamSize() {
  const { formData, updateFormData } = useOnboardingWizard();
  const opts: TeamSizeOpt[] = [
    {
      id: "freelancer",
      title: "Solo / freelancer",
      sub: "Just me, building my brand",
      icon: "person-outline",
    },
    { id: "small", title: "Small team", sub: "2–10 staff or stylists", icon: "people-outline" },
    { id: "medium", title: "Medium team", sub: "11–20 staff members", icon: "business-outline" },
    {
      id: "large",
      title: "Large team",
      sub: "20+ staff across locations",
      icon: "storefront-outline",
    },
  ];
  return (
    <View style={twStyle("gap-4")}>
      <View style={twStyle("mb-2 rounded-[1.5rem] bg-slate-50 px-5 py-4")}>
        <Text style={twStyle("text-[15px] leading-[22px] text-slate-600")}>
          We use this to tailor payroll questions and booking defaults. You can still run salon,
          mobile, or both services later.
        </Text>
      </View>
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
              `rounded-[1.5rem] border p-5 flex-row items-center gap-4 ${sel ? "border-primary bg-primary/10 shadow-sm" : "border-slate-100 bg-white shadow-sm"}`
            )}
            accessibilityRole="button"
            accessibilityLabel={o.title}
            accessibilityState={{ selected: sel }}
          >
            <View
              style={twStyle(
                `h-12 w-12 items-center justify-center rounded-full ${sel ? "bg-primary" : "bg-slate-50"}`
              )}
            >
              <Ionicons name={o.icon} size={22} color={sel ? "#fff" : "#64748b"} />
            </View>
            <View style={twStyle("flex-1")}>
              <Text
                style={twStyle(
                  `text-[17px] font-semibold ${sel ? "text-slate-900" : "text-slate-800"}`
                )}
              >
                {o.title}
              </Text>
              <Text style={twStyle("mt-1 text-[14px] text-slate-500")}>{o.sub}</Text>
            </View>
            {sel ? (
              <Ionicons name="checkmark-circle" size={24} color={Colors.primary} />
            ) : (
              <View style={twStyle("h-6 w-6 rounded-full border-2 border-slate-200")} />
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Step 2: Identity ────────────────────────────────────────────────────────

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
    const e164 =
      coerceOwnerPhoneToE164ForForm(formData.owner_phone) ||
      composeE164FromNational(countryCode, national);
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
      if (patchRes.error)
        throw new Error("Phone verified but could not save to profile. Please try again.");
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
    <View style={twStyle("gap-5")}>
      {/* Name */}
      <View>
        <Text style={twStyle(labelCls)}>Full name</Text>
        <Text style={twStyle("mb-2 text-xs leading-5 text-gray-500")}>
          The name clients see on your profile and bookings.
        </Text>
        <View
          style={twStyle(
            "flex-row items-center overflow-hidden rounded-xl border border-gray-200 bg-white"
          )}
        >
          <View style={twStyle("pl-3 pr-1")}>
            <Ionicons name="person-outline" size={18} color="#9ca3af" />
          </View>
          <TextInput
            value={formData.owner_name || ""}
            onChangeText={(t) => updateFormData({ owner_name: t })}
            placeholder="Your name"
            placeholderTextColor="#9ca3af"
            style={twStyle("flex-1 py-3.5 pr-4 text-base text-gray-900")}
          />
        </View>
      </View>

      {/* Email */}
      <View>
        <Text style={twStyle(labelCls)}>Email</Text>
        <View
          style={twStyle(
            "flex-row items-center overflow-hidden rounded-xl border border-gray-200 bg-white"
          )}
        >
          <View style={twStyle("pl-3 pr-1")}>
            <Ionicons name="mail-outline" size={18} color="#9ca3af" />
          </View>
          <TextInput
            value={formData.owner_email || ""}
            onChangeText={(t) => updateFormData({ owner_email: t })}
            placeholder="you@example.com"
            placeholderTextColor="#9ca3af"
            keyboardType="email-address"
            autoCapitalize="none"
            style={twStyle("flex-1 py-3.5 pr-4 text-base text-gray-900")}
          />
        </View>
      </View>

      {/* Phone */}
      <View>
        <Text style={twStyle(labelCls)}>Mobile number</Text>
        <Text style={twStyle("mb-2 text-xs leading-5 text-gray-500")}>
          We verify this number with a one-time code to protect your account.
        </Text>
        <View style={twStyle("flex-row gap-2")}>
          <TouchableOpacity
            onPress={() => setCountryModal(true)}
            style={twStyle(
              "flex-row items-center gap-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3.5"
            )}
            accessibilityRole="button"
            accessibilityLabel="Change country code"
          >
            <Text style={twStyle("font-medium text-gray-800")}>
              {countryCode.startsWith("+") ? countryCode : `+${countryCode}`}
            </Text>
            <Ionicons name="chevron-down" size={14} color="#6b7280" />
          </TouchableOpacity>
          <TextInput
            value={national}
            onChangeText={(t) => setNational(t.replace(/[^\d\s]/g, ""))}
            placeholder="82 123 4567"
            placeholderTextColor="#9ca3af"
            keyboardType="phone-pad"
            style={twStyle(`${inputCls} flex-1`)}
          />
        </View>

        <Modal visible={countryModal} animationType="slide" presentationStyle="pageSheet">
          <View style={twStyle("flex-1 bg-white p-4 pt-12")}>
            <Text style={twStyle("text-lg font-bold text-gray-900")}>Select country code</Text>
            <TextInput
              value={countrySearch}
              onChangeText={setCountrySearch}
              placeholder="Search country…"
              style={twStyle(
                "mt-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-base"
              )}
            />
            <FlatList<CountryCodeOption>
              {...verticalFlatListPerf}
              data={COUNTRY_CODES.filter(
                (c: CountryCodeOption) =>
                  !countrySearch.trim() ||
                  c.label.toLowerCase().includes(countrySearch.toLowerCase()) ||
                  c.code.replace(/\D/g, "").includes(countrySearch.replace(/\D/g, ""))
              )}
              keyExtractor={(c: CountryCodeOption) => c.code}
              style={twStyle("mt-3 flex-1")}
              renderItem={({ item: c }: { item: CountryCodeOption }) => (
                <TouchableOpacity
                  style={twStyle("flex-row items-center gap-3 border-b border-gray-100 py-3")}
                  onPress={() => {
                    setCountryCode(c.code);
                    setCountryModal(false);
                    setCountrySearch("");
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Use country code ${c.label} ${c.code}`}
                >
                  <Text style={twStyle("text-xl")}>{c.flag}</Text>
                  <Text style={twStyle("flex-1 text-base text-gray-900")}>{c.label}</Text>
                  <Text style={twStyle("text-sm font-medium text-gray-500")}>{c.code}</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity
              onPress={() => setCountryModal(false)}
              style={twStyle("items-center rounded-2xl bg-gray-100 py-3.5")}
              accessibilityRole="button"
              accessibilityLabel="Close country code picker"
            >
              <Text style={twStyle("font-semibold text-gray-700")}>Close</Text>
            </TouchableOpacity>
          </View>
        </Modal>

        {!formData.phone_verified ? (
          <TouchableOpacity
            onPress={sendCode}
            disabled={sending || resendCooldown > 0}
            style={twStyle(
              `mt-3 flex-row items-center justify-center gap-2 rounded-xl py-3.5 ${sending || resendCooldown > 0 ? "bg-gray-200" : "bg-primary"}`
            )}
            accessibilityRole="button"
            accessibilityLabel={codeSent ? "Resend verification code" : "Send verification code"}
            accessibilityState={{ disabled: sending || resendCooldown > 0 }}
          >
            <Ionicons
              name={codeSent ? "refresh-outline" : "send-outline"}
              size={16}
              color={sending || resendCooldown > 0 ? "#6b7280" : "#fff"}
            />
            <Text
              style={twStyle(
                `font-semibold ${sending || resendCooldown > 0 ? "text-gray-600" : "text-white"}`
              )}
            >
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

      {/* OTP entry */}
      {codeSent && !formData.phone_verified ? (
        <View style={twStyle("gap-3 rounded-2xl border-2 border-primary bg-rose-50 p-4")}>
          <View style={twStyle("flex-row items-center gap-2")}>
            <Ionicons name="lock-closed-outline" size={16} color={Colors.primary} />
            <Text style={twStyle("text-sm font-semibold text-primary")}>
              Enter verification code
            </Text>
          </View>
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
            style={[
              twStyle("flex-row items-center justify-center gap-2 rounded-xl py-3.5"),
              { backgroundColor: Colors.primary, opacity: verifying ? 0.7 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Verify phone"
            accessibilityState={{ disabled: verifying }}
          >
            {verifying ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-outline" size={16} color="#fff" />
                <Text style={twStyle("font-semibold text-white")}>Verify phone</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Verified state */}
      {formData.phone_verified ? (
        <View
          style={twStyle(
            "flex-row items-center gap-3 rounded-[1.5rem] border border-emerald-100 bg-emerald-50/50 p-5 mt-2 shadow-sm"
          )}
        >
          <View
            style={twStyle("flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100")}
          >
            <Ionicons name="checkmark" size={18} color="#059669" />
          </View>
          <View style={twStyle("flex-1")}>
            <Text style={twStyle("text-[15px] font-semibold text-emerald-900")}>
              Phone verified
            </Text>
            <Text style={twStyle("text-[14px] text-emerald-700 mt-0.5")}>
              {formData.owner_phone}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => {
              updateFormData({ phone_verified: false });
              setCodeSent(false);
              setOtp("");
              setPendingE164("");
              setResendCooldown(0);
            }}
            accessibilityRole="button"
            accessibilityLabel="Change phone number"
            style={twStyle("bg-white px-3 py-1.5 rounded-full border border-emerald-200 shadow-sm")}
          >
            <Text style={twStyle("text-[13px] font-semibold text-emerald-700")}>Change</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Identity verification hint */}
      <View
        style={twStyle(
          "flex-row gap-3 rounded-[1.5rem] border border-slate-100 bg-white p-5 shadow-sm mt-2"
        )}
      >
        <Ionicons name="shield-checkmark-outline" size={20} color="#64748b" />
        <Text style={twStyle("flex-1 text-[14px] leading-5 text-slate-600")}>
          After setup, you can complete full identity verification (ID document) to earn the
          &ldquo;Verified&rdquo; marketplace badge. This is optional but increases customer trust.
        </Text>
      </View>
    </View>
  );
}

// ─── Step 3: Business details ────────────────────────────────────────────────

type BizTypeOpt = {
  id: BusinessType;
  label: string;
  sub: string;
  icon: ComponentProps<typeof Ionicons>["name"];
};

function Step3Business() {
  const { formData, updateFormData } = useOnboardingWizard();
  const types: BizTypeOpt[] = [
    {
      id: "salon",
      label: "Salon / studio",
      sub: "Fixed location — clients come to you",
      icon: "storefront-outline",
    },
    { id: "mobile", label: "Mobile / at-home", sub: "You travel to clients", icon: "car-outline" },
    { id: "both", label: "Both", sub: "Fixed location + mobile visits", icon: "apps-outline" },
  ];
  return (
    <View style={twStyle("gap-6")}>
      <View>
        <Text style={twStyle(labelCls)}>Business name</Text>
        <Text style={twStyle("mb-3 text-[14px] text-slate-500")}>
          This is shown to clients on your profile and bookings.
        </Text>
        <View
          style={twStyle(
            "flex-row items-center overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm"
          )}
        >
          <View style={twStyle("pl-4 pr-2")}>
            <Ionicons name="briefcase-outline" size={20} color="#64748b" />
          </View>
          <TextInput
            value={formData.business_name || ""}
            onChangeText={(t) => updateFormData({ business_name: t })}
            placeholder="Shown to clients"
            placeholderTextColor="#94a3b8"
            style={twStyle("flex-1 py-4 pr-5 text-[17px] text-slate-900")}
          />
        </View>
      </View>

      <View>
        <Text style={twStyle(labelCls)}>Business type</Text>
        <Text style={twStyle("mb-3 text-[14px] text-slate-500")}>
          Determines which features are enabled and how zones work.
        </Text>
        <View style={twStyle("gap-4")}>
          {types.map((t) => {
            const sel = formData.business_type === t.id;
            return (
              <TouchableOpacity
                key={t.id}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  updateFormData({ business_type: t.id });
                }}
                style={twStyle(
                  `rounded-[1.5rem] border p-5 flex-row items-center gap-4 transition-all duration-300 ${sel ? "border-primary bg-primary/10 shadow-sm" : "border-slate-100 bg-white shadow-sm"}`
                )}
                accessibilityRole="button"
                accessibilityLabel={t.label}
                accessibilityState={{ selected: sel }}
              >
                <View
                  style={twStyle(
                    `h-12 w-12 items-center justify-center rounded-full ${sel ? "bg-primary" : "bg-slate-50"}`
                  )}
                >
                  <Ionicons name={t.icon} size={22} color={sel ? "#fff" : "#64748b"} />
                </View>
                <View style={twStyle("flex-1")}>
                  <Text
                    style={twStyle(
                      `text-[17px] font-semibold ${sel ? "text-slate-900" : "text-slate-800"}`
                    )}
                  >
                    {t.label}
                  </Text>
                  <Text style={twStyle("mt-1 text-[14px] text-slate-500")}>{t.sub}</Text>
                </View>
                {sel ? (
                  <Ionicons name="checkmark-circle" size={24} color={Colors.primary} />
                ) : (
                  <View style={twStyle("h-6 w-6 rounded-full border-2 border-slate-200")} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View>
        <Text style={twStyle(labelCls)}>Description (recommended)</Text>
        <Text style={twStyle("mb-3 text-[14px] text-slate-500")}>
          Tell clients what you offer and what makes you stand out.
        </Text>
        <TextInput
          value={formData.description || ""}
          onChangeText={(t) => updateFormData({ description: t })}
          placeholder="e.g. Specialist in balayage and precision cuts, serving Cape Town for 8 years."
          placeholderTextColor="#94a3b8"
          multiline
          numberOfLines={4}
          style={twStyle(`${inputCls} min-h-[120px] text-[17px] pt-4`)}
        />
        <Text style={twStyle("mt-2 text-right text-[13px] text-slate-400")}>
          {(formData.description || "").length} chars · 10 min recommended
        </Text>
      </View>
    </View>
  );
}

// ─── Step 4: Payment setup ───────────────────────────────────────────────────

type YocoOpt = {
  id: YocoMachine;
  t: string;
  sub: string;
  icon: ComponentProps<typeof Ionicons>["name"];
};

function Step4Payment() {
  const { formData, updateFormData } = useOnboardingWizard();
  const yoco: YocoOpt[] = [
    {
      id: "yes",
      t: "Yes, I have Yoco",
      sub: "I'm already set up for in-person card payments",
      icon: "card-outline",
    },
    {
      id: "no",
      t: "No — I want one",
      sub: "Help me get a Yoco device",
      icon: "add-circle-outline",
    },
    {
      id: "other",
      t: "Other card machine",
      sub: "iZettle, Square, SumUp, or other",
      icon: "phone-portrait-outline",
    },
  ];
  return (
    <View style={twStyle("gap-6")}>
      <View>
        <Text style={twStyle(labelCls)}>Card machine</Text>
        <Text style={twStyle("mb-3 text-[14px] text-slate-500")}>
          Beautonomi uses Yoco for in-person card payments. Select what applies to you.
        </Text>
        <View style={twStyle("gap-4")}>
          {yoco.map((o) => {
            const sel = formData.yoco_machine === o.id;
            return (
              <TouchableOpacity
                key={o.id}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  updateFormData({ yoco_machine: o.id });
                }}
                style={twStyle(
                  `rounded-[1.5rem] border p-5 flex-row items-center gap-4 transition-all duration-300 ${sel ? "border-primary bg-primary/10 shadow-sm" : "border-slate-100 bg-white shadow-sm"}`
                )}
                accessibilityRole="button"
                accessibilityLabel={o.t}
              >
                <View
                  style={twStyle(
                    `h-12 w-12 items-center justify-center rounded-full ${sel ? "bg-primary" : "bg-slate-50"}`
                  )}
                >
                  <Ionicons name={o.icon} size={22} color={sel ? "#fff" : "#64748b"} />
                </View>
                <View style={twStyle("flex-1")}>
                  <Text
                    style={twStyle(
                      `text-[17px] font-semibold ${sel ? "text-slate-900" : "text-slate-800"}`
                    )}
                  >
                    {o.t}
                  </Text>
                  <Text style={twStyle("mt-1 text-[14px] text-slate-500")}>{o.sub}</Text>
                </View>
                {sel ? (
                  <Ionicons name="checkmark-circle" size={24} color={Colors.primary} />
                ) : (
                  <View style={twStyle("h-6 w-6 rounded-full border-2 border-slate-200")} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
        {formData.yoco_machine === "other" ? (
          <TextInput
            value={formData.yoco_machine_other || ""}
            onChangeText={(t) => updateFormData({ yoco_machine_other: t })}
            placeholder="Which device? (e.g. iZettle, Square)"
            placeholderTextColor="#94a3b8"
            style={twStyle(`${inputCls} mt-4 text-[17px]`)}
          />
        ) : null}
      </View>

      <View
        style={twStyle("rounded-[1.5rem] border border-slate-200 bg-white p-5 gap-4 shadow-sm")}
      >
        <View style={twStyle("flex-row items-center gap-4")}>
          <View style={twStyle("h-10 w-10 items-center justify-center rounded-full bg-slate-50")}>
            <Ionicons name="receipt-outline" size={20} color="#64748b" />
          </View>
          <View style={twStyle("flex-1")}>
            <Text style={twStyle("text-[17px] font-semibold text-slate-900")}>
              VAT registered (SARS)
            </Text>
            <Text style={twStyle("mt-1 text-[14px] text-slate-500")}>
              Enables VAT on invoices and financial reports.
            </Text>
          </View>
          <Switch
            value={formData.is_vat_registered === true}
            onValueChange={(v) =>
              updateFormData({
                is_vat_registered: v,
                vat_number: v ? formData.vat_number : undefined,
              })
            }
            trackColor={{ false: "#e2e8f0", true: Colors.primary }}
          />
        </View>
        {formData.is_vat_registered ? (
          <>
            <View style={twStyle("h-px bg-slate-100")} />
            <TextInput
              value={formData.vat_number || ""}
              onChangeText={(t) =>
                updateFormData({ vat_number: t.replace(/\D/g, "").slice(0, 10) })
              }
              placeholder="10-digit VAT number"
              placeholderTextColor="#94a3b8"
              keyboardType="number-pad"
              style={twStyle(`${inputCls} text-[17px]`)}
            />
          </>
        ) : null}
      </View>
    </View>
  );
}

// ─── Step 5: Previous software picker ────────────────────────────────────────

type SoftwareOption = {
  id: string;
  label: string;
  icon: ComponentProps<typeof Ionicons>["name"];
};

/**
 * Icon map for all slugs that exist in `previous_software_options`.
 * Slugs not present here fall back to `apps-outline`.
 */
const SLUG_ICON_MAP: Record<string, ComponentProps<typeof Ionicons>["name"]> = {
  mangomint: "sparkles-outline",
  fresha: "calendar-outline",
  booksy: "book-outline",
  Malakyt: "apps-outline",
  acuity: "alarm-outline",
  mindbody: "body-outline",
  glossgenius: "color-wand-outline",
  schedulicity: "calendar-clear-outline",
  vagaro: "grid-outline",
  salon_iris: "flower-outline",
  phorest: "leaf-outline",
  zenoti: "business-outline",
  mio: "phone-portrait-outline",
};

/**
 * Exact mirror of the `previous_software_options` table (sorted by display_order),
 * excluding the special "none" and "other" entries which live in ALWAYS_BOTTOM.
 *
 * The API replaces this at runtime; the fallback only applies when the network
 * call fails or the table is empty.
 */
const FALLBACK_SOFTWARE: SoftwareOption[] = [
  { id: "mangomint", label: "Mangomint", icon: "sparkles-outline" },
  { id: "fresha", label: "Fresha", icon: "calendar-outline" },
  { id: "booksy", label: "Booksy", icon: "book-outline" },
  { id: "Malakyt", label: "Malakyt", icon: "apps-outline" },
  { id: "acuity", label: "Acuity Scheduling", icon: "alarm-outline" },
  { id: "mindbody", label: "Mindbody", icon: "body-outline" },
  { id: "glossgenius", label: "GlossGenius", icon: "color-wand-outline" },
  { id: "schedulicity", label: "Schedulicity", icon: "calendar-clear-outline" },
  { id: "vagaro", label: "Vagaro", icon: "grid-outline" },
  { id: "salon_iris", label: "Salon Iris", icon: "flower-outline" },
  { id: "phorest", label: "Phorest", icon: "leaf-outline" },
  { id: "zenoti", label: "Zenoti", icon: "business-outline" },
  { id: "mio", label: "Mio", icon: "phone-portrait-outline" },
];

/** Always pinned at the bottom — same slugs/names as in the table. */
const ALWAYS_BOTTOM: SoftwareOption[] = [
  { id: "none", label: "None / First time using salon software", icon: "hand-left-outline" },
  { id: "other", label: "Other (please specify)", icon: "ellipsis-horizontal-outline" },
];

/** Slugs managed by ALWAYS_BOTTOM — filtered out of the API-mapped list to avoid duplicates. */
const SPECIAL_SLUGS = new Set(["none", "other"]);

function Step5Software() {
  const { formData, updateFormData } = useOnboardingWizard();

  // Start with the built-in fallback so the UI is never blank while loading.
  const [softwareOptions, setSoftwareOptions] = useState<SoftwareOption[]>(FALLBACK_SOFTWARE);
  const [loadingOptions, setLoadingOptions] = useState(true);

  const [customValue, setCustomValue] = useState(
    formData.previous_software === "other" ? formData.previous_software_other || "" : ""
  );

  // Fetch the canonical list from the platform API — same source as the web onboarding.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await api.get<
          { id: string; name: string; slug: string; display_order?: number }[]
        >("/api/public/previous-software-options");
        if (!active) return;
        const list = Array.isArray(res.data) ? res.data : [];
        if (list.length > 0) {
          // Filter out "none" and "other" — those are handled by ALWAYS_BOTTOM.
          const mapped = list
            .filter((o) => !SPECIAL_SLUGS.has(o.slug))
            .map(
              (o): SoftwareOption => ({
                id: o.slug,
                label: o.name,
                icon: SLUG_ICON_MAP[o.slug] ?? ("apps-outline" as const),
              })
            );
          if (mapped.length > 0) setSoftwareOptions(mapped);
        }
        // If API returns nothing usable, keep FALLBACK_SOFTWARE already set above.
      } catch {
        // Non-blocking — fallback list already in state.
      } finally {
        if (active) setLoadingOptions(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // All displayed options: dynamic/fallback list + always-bottom fixed options.
  const allOptions = [...softwareOptions, ...ALWAYS_BOTTOM];

  const selectedId =
    formData.previous_software === "other"
      ? "other"
      : formData.previous_software === "none"
        ? "none"
        : (allOptions.find((s) => s.id === formData.previous_software)?.id ?? "");

  const handleSelect = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (id === "other") {
      updateFormData({
        previous_software: "other",
        previous_software_other: customValue || undefined,
      });
    } else {
      updateFormData({ previous_software: id || undefined, previous_software_other: undefined });
      setCustomValue("");
    }
  };

  return (
    <View style={twStyle("gap-4")}>
      <View style={twStyle("rounded-[1.5rem] bg-slate-50 px-5 py-4")}>
        <Text style={twStyle("text-[14px] leading-5 text-slate-600")}>
          Optional — helps us understand where you&apos;re coming from. We&apos;ll tailor import
          tips and onboarding hints.
        </Text>
      </View>

      {loadingOptions ? (
        <View style={twStyle("items-center py-6")}>
          <ActivityIndicator color="#0f172a" size="small" />
          <Text style={twStyle("mt-2 text-[13px] text-slate-400")}>Loading options…</Text>
        </View>
      ) : (
        <View style={twStyle("flex-row flex-wrap gap-2.5")}>
          {allOptions.map((s) => {
            const sel = selectedId === s.id;
            return (
              <TouchableOpacity
                key={s.id}
                onPress={() => handleSelect(s.id)}
                style={twStyle(
                  `flex-row items-center gap-2 rounded-full border px-4 py-3 transition-all duration-300 ${sel ? "border-primary bg-primary/10 shadow-sm" : "border-slate-200 bg-white"}`
                )}
                accessibilityRole="button"
                accessibilityLabel={s.label}
                accessibilityState={{ selected: sel }}
              >
                <Ionicons name={s.icon} size={16} color={sel ? Colors.primary : "#64748b"} />
                <Text
                  style={twStyle(
                    `text-[15px] font-semibold ${sel ? "text-slate-900" : "text-slate-700"}`
                  )}
                >
                  {s.label}
                </Text>
                {sel ? <Ionicons name="checkmark-circle" size={16} color={Colors.primary} /> : null}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {selectedId === "other" ? (
        <View>
          <TextInput
            value={customValue}
            onChangeText={(t) => {
              setCustomValue(t);
              const slug = t.toLowerCase().replace(/\s+/g, "_").slice(0, 80);
              updateFormData({
                previous_software: "other",
                previous_software_other: slug || undefined,
              });
            }}
            placeholder="Type the software name…"
            placeholderTextColor="#9ca3af"
            style={twStyle(inputCls)}
            autoFocus
          />
        </View>
      ) : null}

      {/* Show the currently-selected value for confirmation when it matches
          a free-form slug that isn't in the displayed list (edge case on resume). */}
      {formData.previous_software &&
      formData.previous_software !== "other" &&
      formData.previous_software !== "none" &&
      !allOptions.find((s) => s.id === formData.previous_software) ? (
        <View
          style={twStyle(
            "flex-row items-center gap-3 rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-3"
          )}
        >
          <Ionicons name="checkmark-circle" size={18} color="#0f172a" />
          <Text style={twStyle("text-[15px] text-slate-700")}>
            Selected:{" "}
            <Text style={twStyle("font-semibold")}>
              {formData.previous_software.replace(/_/g, " ")}
            </Text>
          </Text>
          <TouchableOpacity
            onPress={() =>
              updateFormData({ previous_software: undefined, previous_software_other: undefined })
            }
            style={twStyle("ml-auto")}
          >
            <Text style={twStyle("text-[13px] font-semibold text-slate-400")}>Clear</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

// ─── Step 6: Payroll ─────────────────────────────────────────────────────────

type PayrollOpt = {
  id: "commission" | "hourly" | "both" | "other";
  label: string;
  sub: string;
  icon: ComponentProps<typeof Ionicons>["name"];
};

function Step6Payroll() {
  const { formData, updateFormData } = useOnboardingWizard();
  const opts: PayrollOpt[] = [
    {
      id: "commission",
      label: "Commission",
      sub: "Staff earn a % of each service",
      icon: "pie-chart-outline",
    },
    {
      id: "hourly",
      label: "Hourly / salary",
      sub: "Fixed rate regardless of bookings",
      icon: "time-outline",
    },
    {
      id: "both",
      label: "Mixed",
      sub: "Combination of commission and fixed pay",
      icon: "layers-outline",
    },
    {
      id: "other",
      label: "Other",
      sub: "We'll discuss this after setup",
      icon: "ellipsis-horizontal-circle-outline",
    },
  ];
  return (
    <View style={twStyle("gap-6")}>
      <View style={twStyle("rounded-[1.5rem] bg-slate-50 px-5 py-4")}>
        <Text style={twStyle("text-[14px] leading-5 text-slate-600")}>
          How you compensate your staff or contractors. You can refine this in Payroll settings
          anytime.
        </Text>
      </View>
      <View>
        <Text style={twStyle(labelCls)}>Payroll model</Text>
        <View style={twStyle("gap-4 mt-2")}>
          {opts.map((o) => {
            const sel = formData.payroll_type === o.id;
            return (
              <TouchableOpacity
                key={o.id}
                onPress={() => updateFormData({ payroll_type: o.id })}
                style={twStyle(
                  `rounded-[1.5rem] border p-5 flex-row items-center gap-4 transition-all duration-300 ${sel ? "border-primary bg-primary/10 shadow-sm" : "border-slate-100 bg-white shadow-sm"}`
                )}
                accessibilityRole="button"
                accessibilityLabel={o.label}
                accessibilityState={{ selected: sel }}
              >
                <View
                  style={twStyle(
                    `h-12 w-12 items-center justify-center rounded-full ${sel ? "bg-primary" : "bg-slate-50"}`
                  )}
                >
                  <Ionicons name={o.icon} size={22} color={sel ? "#fff" : "#64748b"} />
                </View>
                <View style={twStyle("flex-1")}>
                  <Text
                    style={twStyle(
                      `text-[17px] font-semibold ${sel ? "text-slate-900" : "text-slate-800"}`
                    )}
                  >
                    {o.label}
                  </Text>
                  <Text style={twStyle("mt-1 text-[14px] text-slate-500")}>{o.sub}</Text>
                </View>
                {sel ? (
                  <Ionicons name="checkmark-circle" size={24} color={Colors.primary} />
                ) : (
                  <View style={twStyle("h-6 w-6 rounded-full border-2 border-slate-200")} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
      <View
        style={twStyle("rounded-[1.5rem] border border-slate-200 bg-white p-5 gap-3 shadow-sm")}
      >
        <Text style={twStyle(labelCls)}>Optional details</Text>
        <Text style={twStyle("text-[14px] text-slate-500 mb-1")}>
          Anything about schedules, commission splits, or tools.
        </Text>
        <TextInput
          value={formData.payroll_details || ""}
          onChangeText={(t) => updateFormData({ payroll_details: t })}
          placeholder="Optional details"
          placeholderTextColor="#94a3b8"
          style={twStyle(`${inputCls} text-[17px]`)}
        />
      </View>
    </View>
  );
}

// ─── Step 7: Location ────────────────────────────────────────────────────────

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
  const mapboxCountry = countryFilterIso2FromStorage(addr.country || DEFAULT_COUNTRY_NAME) ?? "ZA";

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
      const allowed = await ensureForegroundLocationPermission({
        title: "Location",
        message: "Allow location access to set your address from your current position.",
      });
      if (!allowed) {
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
        updateFormData({ address: { ...addr, latitude: lat, longitude: lng } });
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
      updateFormData({ address: { ...addr, latitude: lat, longitude: lng } });
    }
    setMapPinOpen(false);
  };

  return (
    <View style={twStyle("gap-6")}>
      <View style={twStyle("rounded-[1.5rem] bg-slate-50 px-5 py-4")}>
        <Text style={twStyle("text-[14px] leading-5 text-slate-600")}>
          Search for your street, drop a pin on the map, or use your current location — we save
          coordinates for zones and travel.
        </Text>
      </View>
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
      <View style={twStyle("flex-row flex-wrap gap-3")}>
        <TouchableOpacity
          onPress={() => void handleUseCurrentLocation()}
          disabled={locating}
          style={twStyle(
            `rounded-full border px-4 py-2.5 flex-row items-center gap-2 transition-all duration-300 ${locating ? "border-slate-200 bg-slate-100" : "border-primary bg-primary shadow-sm"}`
          )}
          accessibilityRole="button"
          accessibilityLabel="Use current location"
        >
          {locating ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="locate-outline" size={16} color="#fff" />
          )}
          <Text
            style={twStyle(
              `text-[14px] font-semibold ${locating ? "text-slate-500" : "text-white"}`
            )}
          >
            {locating ? "Locating…" : "Current location"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setMapPinOpen(true)}
          style={twStyle(
            "rounded-full border border-slate-200 bg-white px-4 py-2.5 flex-row items-center gap-2 shadow-sm transition-all duration-300"
          )}
          accessibilityRole="button"
          accessibilityLabel="Drop pin on map"
        >
          <Ionicons name="map-outline" size={16} color="#0f172a" />
          <Text style={twStyle("text-[14px] font-semibold text-slate-800")}>Drop pin on map</Text>
        </TouchableOpacity>
      </View>

      {addr.latitude != null && addr.longitude != null ? (
        <View style={twStyle("mt-2")}>
          <View
            style={twStyle("overflow-hidden rounded-[1.5rem] border border-slate-200 shadow-sm")}
          >
            <StaticMapImage
              latitude={addr.latitude}
              longitude={addr.longitude}
              width={Math.min(windowWidth - 48, 400)}
              height={160}
              zoom={15}
            />
          </View>
          <Text style={twStyle("mt-2 text-center text-[13px] text-slate-500")}>
            Map preview · edit fields below if needed
          </Text>
        </View>
      ) : null}

      <View style={twStyle("gap-4 mt-2")}>
        <View>
          <Text style={twStyle(labelCls)}>Apt / suite (optional)</Text>
          <TextInput
            value={addr.line2 || ""}
            onChangeText={(t) => updateFormData({ address: { ...addr, line2: t || undefined } })}
            style={twStyle(`${inputCls} text-[17px]`)}
          />
        </View>
        <View>
          <Text style={twStyle(labelCls)}>City</Text>
          <TextInput
            value={addr.city || ""}
            onChangeText={(t) => updateFormData({ address: { ...addr, city: t } })}
            style={twStyle(`${inputCls} text-[17px]`)}
          />
        </View>
        <View>
          <Text style={twStyle(labelCls)}>Country</Text>
          <TextInput
            value={addr.country || ""}
            onChangeText={(t) => updateFormData({ address: { ...addr, country: t } })}
            style={twStyle(`${inputCls} text-[17px]`)}
          />
        </View>
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

// ─── Step 8: Photos ───────────────────────────────────────────────────────────

// §provider-onboarding-photos 2026-05: client-side guardrails mirror
// `/api/upload` server limits (5MB image-only). Without these, large gallery
// selections silently failed after the multi-MB upload completed, which both
// wasted bandwidth and broke the "select 4+ photos" path the user reported.
const ONBOARDING_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
const ONBOARDING_ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const ONBOARDING_GALLERY_LIMIT = 12;

function inferMime(asset: { mimeType?: string | null; fileName?: string | null }): string {
  const mime = (asset.mimeType || "").toLowerCase().split(";")[0]?.trim();
  if (mime && ONBOARDING_ALLOWED_MIME.has(mime)) return mime;
  const ext = (asset.fileName || "").toLowerCase().split(".").pop();
  switch (ext) {
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "jpg":
    case "jpeg":
    default:
      return "image/jpeg";
  }
}

async function uploadOnboardingImage(
  uri: string,
  mime: string,
  name: string
): Promise<string | null> {
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
  const { pickWithOptions, pickMultipleFromLibrary } = useImagePicker();
  const [uploading, setUploading] = useState<{ thumb: boolean; avatar: boolean; gallery: boolean }>(
    { thumb: false, avatar: false, gallery: false }
  );
  const [galleryProgress, setGalleryProgress] = useState<{ done: number; total: number } | null>(
    null,
  );

  const pick = async (kind: "thumb" | "avatar" | "gallery") => {
    const isGallery = kind === "gallery";
    const currentGallery = formData.gallery || [];
    const remainingSlots = isGallery
      ? Math.max(0, ONBOARDING_GALLERY_LIMIT - currentGallery.length)
      : 1;
    if (isGallery && remainingSlots <= 0) {
      Alert.alert(
        "Gallery full",
        `You can upload up to ${ONBOARDING_GALLERY_LIMIT} gallery photos in onboarding. Remove a photo to add more.`,
      );
      return;
    }

    let pickedAssets: ImagePicker.ImagePickerAsset[] = [];
    if (isGallery) {
      const assets = await pickMultipleFromLibrary({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        selectionLimit: remainingSlots,
      });
      if (!assets?.length) return;
      pickedAssets = assets;
    } else {
      const single = await pickWithOptions({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.85,
      });
      if (!single) return;
      pickedAssets = [
        {
          uri: single.uri,
          width: single.width,
          height: single.height,
          fileName: single.fileName,
          mimeType: single.mimeType,
          fileSize: single.fileSize,
        },
      ];
    }

    // Pre-validate everything client-side so we never start the upload on
    // assets we know the server will reject (saves 5MB+ wasted bandwidth and
    // surfaces the failure immediately).
    const validAssets: ImagePicker.ImagePickerAsset[] = [];
    const rejected: string[] = [];
    for (const a of pickedAssets) {
      const mime = inferMime({ mimeType: a.mimeType, fileName: a.fileName });
      if (!ONBOARDING_ALLOWED_MIME.has(mime)) {
        rejected.push(`${a.fileName || "Image"}: unsupported type`);
        continue;
      }
      const size = (a as { fileSize?: number }).fileSize;
      if (typeof size === "number" && size > ONBOARDING_UPLOAD_MAX_BYTES) {
        rejected.push(`${a.fileName || "Image"}: larger than 5MB`);
        continue;
      }
      validAssets.push(a);
    }
    if (rejected.length > 0 && validAssets.length === 0) {
      Alert.alert("Couldn't add these photos", rejected.join("\n"));
      return;
    }
    if (rejected.length > 0) {
      Alert.alert("Some photos were skipped", rejected.join("\n"));
    }
    if (validAssets.length === 0) return;

    setUploading((p) => ({ ...p, [kind]: true }));
    try {
      if (!isGallery) {
        const a = validAssets[0];
        const url = await uploadOnboardingImage(
          a.uri,
          inferMime({ mimeType: a.mimeType, fileName: a.fileName }),
          a.fileName || `img-${Date.now()}.jpg`,
        );
        if (!url) {
          Alert.alert("Upload failed", "Couldn't upload the photo. Please try again.");
          return;
        }
        if (kind === "thumb") updateFormData({ thumbnail_url: url });
        else updateFormData({ avatar_url: url });
      } else {
        // §provider-onboarding-photos 2026-05: previous parallel `Promise.all`
        // over up to 10 multi-MB images was unreliable on mobile networks and
        // broke when the device throttled requests. Sequential uploads keep
        // memory and bandwidth predictable, surface partial failures cleanly,
        // and let us show "X of Y" progress instead of a frozen spinner.
        const baseGallery = formData.gallery || [];
        const newUrls: string[] = [];
        const failed: string[] = [];
        setGalleryProgress({ done: 0, total: validAssets.length });
        for (let i = 0; i < validAssets.length; i++) {
          const a = validAssets[i];
          const url = await uploadOnboardingImage(
            a.uri,
            inferMime({ mimeType: a.mimeType, fileName: a.fileName }),
            a.fileName || `img-${Date.now()}-${i}.jpg`,
          );
          if (url) {
            newUrls.push(url);
            // §provider-onboarding-photos 2026-05: append each successful
            // upload immediately so a mid-batch crash/cancel doesn't lose
            // finished work. Recompute from the captured base so we never
            // duplicate the running list across iterations.
            updateFormData({ gallery: [...baseGallery, ...newUrls] });
          } else {
            failed.push(a.fileName || `Image ${i + 1}`);
          }
          setGalleryProgress({ done: i + 1, total: validAssets.length });
        }
        if (newUrls.length === 0) {
          Alert.alert(
            "Upload failed",
            "None of the photos could be uploaded. Check your connection and try again.",
          );
          return;
        }
        if (failed.length > 0) {
          Alert.alert(
            "Some uploads failed",
            `${failed.length} of ${validAssets.length} photo${
              validAssets.length === 1 ? "" : "s"
            } could not be uploaded:\n${failed.join("\n")}`,
          );
        }
      }
    } finally {
      setUploading((p) => ({ ...p, [kind]: false }));
      setGalleryProgress(null);
    }
  };

  const removeGalleryAt = (idx: number) => {
    const cur = formData.gallery || [];
    updateFormData({ gallery: cur.filter((_, i) => i !== idx) });
  };

  const thumbUrl = formData.thumbnail_url;
  const avatarUrl = formData.avatar_url;
  const gallery = formData.gallery || [];

  const renderSlot = (
    kind: "thumb" | "avatar",
    title: string,
    subtitle: string,
    url: string | undefined
  ) => (
    <View style={twStyle("rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm")}>
      <View style={twStyle("flex-row items-center gap-4")}>
        <View
          style={twStyle(
            `h-20 w-20 items-center justify-center overflow-hidden rounded-[1.25rem] ${url ? "" : "border-2 border-dashed border-slate-200 bg-slate-50"}`
          )}
        >
          {url ? (
            <Image source={{ uri: url }} style={{ width: 80, height: 80 }} resizeMode="cover" />
          ) : (
            <Ionicons name="image-outline" size={26} color="#94a3b8" />
          )}
        </View>
        <View style={twStyle("flex-1")}>
          <Text style={twStyle("text-[17px] font-semibold text-slate-900")}>{title}</Text>
          <Text style={twStyle("mt-1 text-[14px] text-slate-500")}>{subtitle}</Text>
          {url ? (
            <View style={twStyle("mt-2 flex-row items-center gap-1.5")}>
              <Ionicons name="checkmark-circle" size={16} color="#059669" />
              <Text style={twStyle("text-[13px] font-medium text-emerald-700")}>Uploaded</Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={twStyle("mt-4 flex-row gap-3")}>
        <TouchableOpacity
          onPress={() => pick(kind)}
          disabled={uploading[kind]}
          style={twStyle(
            `flex-1 flex-row items-center justify-center gap-2 rounded-full py-3.5 transition-all duration-300 ${uploading[kind] ? "bg-slate-100" : "bg-primary shadow-sm"}`
          )}
          accessibilityRole="button"
          accessibilityLabel={url ? `Replace ${title}` : `Upload ${title}`}
        >
          {uploading[kind] ? (
            <ActivityIndicator color="#64748b" size="small" />
          ) : (
            <>
              <Ionicons
                name={url ? "refresh-outline" : "cloud-upload-outline"}
                size={18}
                color="#fff"
              />
              <Text style={twStyle("text-[15px] font-semibold text-white")}>
                {url ? "Replace" : "Choose photo"}
              </Text>
            </>
          )}
        </TouchableOpacity>
        {url ? (
          <TouchableOpacity
            onPress={() => {
              if (kind === "thumb") updateFormData({ thumbnail_url: undefined });
              else updateFormData({ avatar_url: undefined });
            }}
            style={twStyle(
              "items-center justify-center rounded-full border border-rose-100 bg-rose-50 px-5 transition-all duration-300"
            )}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${title}`}
          >
            <Ionicons name="trash-outline" size={20} color="#e11d48" />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );

  return (
    <View style={twStyle("gap-4")}>
      <View
        style={twStyle(
          "rounded-[1.5rem] border border-amber-100 bg-amber-50/80 px-5 py-4 shadow-sm"
        )}
      >
        <Text style={twStyle("text-[14px] leading-5 text-amber-900")}>
          Required — upload both images so your customer web and app provider cards always have a
          reliable thumbnail and profile avatar.
        </Text>
      </View>
      {renderSlot("thumb", "Main business photo", "Required hero image on your public listing", thumbUrl)}
      {renderSlot("avatar", "Profile photo", "Required avatar shown on cards, chats, reviews, and bookings", avatarUrl)}

      <View
        style={twStyle("rounded-[1.5rem] border border-slate-200 bg-white p-5 gap-4 shadow-sm")}
      >
        <View style={twStyle("flex-row items-center justify-between")}>
          <View style={twStyle("flex-1 pr-2")}>
            <Text style={twStyle("text-[17px] font-semibold text-slate-900")}>Gallery</Text>
            <Text style={twStyle("mt-1 text-[14px] text-slate-500")}>
              {galleryProgress
                ? `Uploading ${galleryProgress.done} of ${galleryProgress.total}…`
                : gallery.length > 0
                  ? `${gallery.length} of ${ONBOARDING_GALLERY_LIMIT} photos added`
                  : `Portfolio-style work photos · up to ${ONBOARDING_GALLERY_LIMIT}`}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => pick("gallery")}
            disabled={uploading.gallery || gallery.length >= ONBOARDING_GALLERY_LIMIT}
            style={twStyle(
              `flex-row items-center gap-2 rounded-full px-4 py-3 transition-all duration-300 ${
                uploading.gallery || gallery.length >= ONBOARDING_GALLERY_LIMIT
                  ? "bg-slate-100"
                  : "bg-primary shadow-sm"
              }`
            )}
            accessibilityRole="button"
            accessibilityLabel="Add gallery photo"
            accessibilityState={{
              disabled: uploading.gallery || gallery.length >= ONBOARDING_GALLERY_LIMIT,
            }}
          >
            {uploading.gallery ? (
              <ActivityIndicator color="#64748b" size="small" />
            ) : (
              <>
                <Ionicons
                  name="add"
                  size={18}
                  color={gallery.length >= ONBOARDING_GALLERY_LIMIT ? "#94a3b8" : "#fff"}
                />
                <Text
                  style={twStyle(
                    `text-[15px] font-semibold ${
                      gallery.length >= ONBOARDING_GALLERY_LIMIT ? "text-slate-400" : "text-white"
                    }`,
                  )}
                >
                  {gallery.length >= ONBOARDING_GALLERY_LIMIT ? "Full" : "Add"}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
        {gallery.length > 0 ? (
          <View style={twStyle("flex-row flex-wrap gap-3")}>
            {gallery.map((url, idx) => (
              <View key={`${url}-${idx}`} style={{ position: "relative", width: 80, height: 80 }}>
                <Image
                  source={{ uri: url }}
                  style={{ width: 80, height: 80, borderRadius: 16 }}
                  resizeMode="cover"
                />
                <TouchableOpacity
                  onPress={() => removeGalleryAt(idx)}
                  hitSlop={8}
                  style={{
                    position: "absolute",
                    top: -6,
                    right: -6,
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    backgroundColor: "#e11d48",
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 2,
                    borderColor: "#fff",
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

// ─── Step 9: Service zones ───────────────────────────────────────────────────

type ZoneRow = { id: string; name: string; zone_type: string; match_reason?: string };

function Step9Zones() {
  const { formData, updateFormData } = useOnboardingWizard();
  const [zones, setZones] = useState<ZoneRow[]>([]);
  const [loading, setLoading] = useState(true);
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
        const res = await api.post<{ suggested_zones: ZoneRow[] }>(
          "/api/provider/onboarding/suggest-zones",
          {
            address: formData.address?.line1 || "",
            latitude: lat,
            longitude: lng,
            city: formData.address?.city || "",
            postal_code: formData.address?.postal_code || "",
            country: formData.address?.country || "",
          }
        );
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    formData.address?.latitude,
    formData.address?.longitude,
    formData.address?.line1,
    formData.address?.city,
    formData.address?.postal_code,
    formData.address?.country,
    updateFormData,
  ]);

  if (loading) {
    return (
      <View style={twStyle("py-12 items-center gap-3")}>
        <ActivityIndicator color="#0f172a" size="large" />
        <Text style={twStyle("text-[15px] font-medium text-slate-500")}>Finding nearby zones…</Text>
      </View>
    );
  }

  if (!zones.length) {
    return (
      <View
        style={twStyle(
          "rounded-[1.5rem] border border-slate-200 bg-slate-50 p-8 items-center gap-3 shadow-sm"
        )}
      >
        <View
          style={twStyle(
            "h-16 w-16 items-center justify-center rounded-full bg-white shadow-sm mb-2"
          )}
        >
          <Ionicons name="map-outline" size={32} color="#94a3b8" />
        </View>
        <Text style={twStyle("text-[17px] font-semibold text-slate-700")}>
          No zones found nearby
        </Text>
        <Text style={twStyle("text-center text-[14px] text-slate-500 max-w-[250px]")}>
          You can configure service zones later in Settings › Service Zones.
        </Text>
      </View>
    );
  }

  const toggle = (id: string) => {
    const cur = formData.selected_zone_ids || [];
    if (cur.includes(id)) updateFormData({ selected_zone_ids: cur.filter((x) => x !== id) });
    else updateFormData({ selected_zone_ids: [...cur, id] });
  };

  const selectedIds = formData.selected_zone_ids || [];

  return (
    <View style={twStyle("gap-4")}>
      <View style={twStyle("flex-row items-center justify-between mb-2")}>
        <Text style={twStyle("text-[14px] font-medium text-slate-600")}>
          {selectedIds.length} of {zones.length} zones selected
        </Text>
        <TouchableOpacity
          onPress={() =>
            selectedIds.length === zones.length
              ? updateFormData({ selected_zone_ids: [] })
              : updateFormData({ selected_zone_ids: zones.map((z) => z.id) })
          }
          style={twStyle("rounded-full bg-slate-100 px-3 py-1.5")}
        >
          <Text style={twStyle("text-[13px] font-semibold text-slate-700")}>
            {selectedIds.length === zones.length ? "Deselect all" : "Select all"}
          </Text>
        </TouchableOpacity>
      </View>
      <FlatList<ZoneRow>
        {...verticalFlatListPerf}
        data={zones}
        keyExtractor={(z: ZoneRow) => z.id}
        scrollEnabled={false}
        contentContainerStyle={twStyle("gap-3")}
        renderItem={({ item }: { item: ZoneRow }) => {
          const on = selectedIds.includes(item.id);
          return (
            <TouchableOpacity
              onPress={() => toggle(item.id)}
              style={twStyle(
                `rounded-[1.5rem] border p-5 flex-row items-center gap-4 transition-all duration-300 ${on ? "border-primary bg-primary/10 shadow-sm" : "border-slate-200 bg-white"}`
              )}
            >
              <View
                style={twStyle(
                  `h-10 w-10 items-center justify-center rounded-full ${on ? "bg-primary" : "bg-slate-100"}`
                )}
              >
                <Ionicons name="location-outline" size={20} color={on ? "#fff" : "#64748b"} />
              </View>
              <View style={twStyle("flex-1")}>
                <Text
                  style={twStyle(
                    `text-[17px] font-semibold ${on ? "text-slate-900" : "text-slate-800"}`
                  )}
                >
                  {item.name}
                </Text>
                {item.match_reason ? (
                  <Text style={twStyle("mt-1 text-[13px] text-slate-500")}>
                    {item.match_reason}
                  </Text>
                ) : null}
              </View>
              {on ? (
                <Ionicons name="checkmark-circle" size={24} color={Colors.primary} />
              ) : (
                <View style={twStyle("h-6 w-6 rounded-full border-2 border-slate-200")} />
              )}
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

// ─── Step 10: Categories ─────────────────────────────────────────────────────

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
      <View style={twStyle("py-12 items-center gap-3")}>
        <ActivityIndicator color="#0f172a" size="large" />
        <Text style={twStyle("text-[15px] font-medium text-slate-500")}>Loading categories…</Text>
      </View>
    );
  }

  const toggle = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const cur = formData.global_category_ids || [];
    if (cur.includes(id)) updateFormData({ global_category_ids: cur.filter((x) => x !== id) });
    else updateFormData({ global_category_ids: [...cur, id] });
  };

  const selectedCount = (formData.global_category_ids || []).length;

  return (
    <View style={twStyle("gap-5")}>
      <View style={twStyle("flex-row items-center justify-between")}>
        <Text style={twStyle("text-[14px] text-slate-600")}>
          Choose all that apply — you can change these later.
        </Text>
        {selectedCount > 0 ? (
          <View style={twStyle("rounded-full bg-primary px-3 py-1")}>
            <Text style={twStyle("text-[12px] font-bold text-white")}>{selectedCount}</Text>
          </View>
        ) : null}
      </View>
      <FlatList<Cat>
        {...verticalFlatListPerf}
        data={cats}
        keyExtractor={(c: Cat) => c.id}
        numColumns={2}
        columnWrapperStyle={twStyle("gap-3")}
        scrollEnabled={false}
        renderItem={({ item }: { item: Cat }) => {
          const on = (formData.global_category_ids || []).includes(item.id);
          const iconUri = resolveGlobalCategoryIconUri(item.icon, APP_URL);
          return (
            <TouchableOpacity
              onPress={() => toggle(item.id)}
              style={twStyle(
                `mb-3 flex-1 rounded-[1.5rem] border p-4 transition-all duration-300 ${on ? "border-primary bg-primary/10 shadow-sm" : "border-slate-200 bg-white shadow-sm"}`
              )}
              accessibilityRole="button"
              accessibilityLabel={item.name}
              accessibilityState={{ selected: on }}
            >
              {on ? (
                <View
                  style={twStyle(
                    "absolute right-3 top-3 h-5 w-5 items-center justify-center rounded-full bg-primary"
                  )}
                >
                  <Ionicons name="checkmark" size={13} color="#ffffff" />
                </View>
              ) : null}
              <View
                style={twStyle(
                  `mb-3 h-16 w-16 items-center justify-center rounded-2xl border ${on ? "border-primary bg-white" : "border-slate-100 bg-slate-50"}`
                )}
              >
                {iconUri ? (
                  <ExpoImage
                    source={{ uri: iconUri }}
                    style={{ width: 46, height: 46 }}
                    contentFit="contain"
                    accessibilityIgnoresInvertColors
                  />
                ) : (
                  <Ionicons name="pricetag-outline" size={26} color={on ? Colors.primary : "#64748b"} />
                )}
              </View>
              <Text
                style={twStyle(
                  `text-[15px] font-semibold leading-snug ${on ? "text-slate-900" : "text-slate-800"}`
                )}
                numberOfLines={2}
              >
                {item.name}
              </Text>
              {on ? (
                <View style={twStyle("mt-2 flex-row items-center gap-1.5")}>
                  <Ionicons name="checkmark-circle" size={14} color={Colors.primary} />
                  <Text style={twStyle("text-[12px] font-semibold text-primary")}>Selected</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

// ─── Step 11: Services ───────────────────────────────────────────────────────

type ServiceTypeOption = { value: string; label: string };

const SERVICE_TYPE_OPTIONS: ServiceTypeOption[] = [
  { value: "basic", label: "Basic" },
  { value: "addon", label: "Add-on" },
  { value: "package", label: "Package" },
];

const AVAILABILITY_OPTIONS: ServiceTypeOption[] = [
  { value: "everyone", label: "Everyone" },
  { value: "women", label: "Women" },
  { value: "men", label: "Men" },
];

const TAX_RATE_OPTIONS: ServiceTypeOption[] = [
  { value: "0", label: "No tax" },
  { value: "15", label: "15% VAT" },
];

function Step11Services() {
  const { formData, updateFormData } = useOnboardingWizard();
  const tenantCurrency = getTenantDefaultCurrency();
  const [allCats, setAllCats] = useState<Cat[]>([]);
  const [loadingCats, setLoadingCats] = useState(true);
  const [categoryId, setCategoryId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [supportsAtSalon, setSupportsAtSalon] = useState(formData.business_type !== "mobile");
  const [supportsAtHome, setSupportsAtHome] = useState(formData.business_type !== "salon");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [addonName, setAddonName] = useState("");
  const [addonPrice, setAddonPrice] = useState("");
  const [addonDuration, setAddonDuration] = useState("");
  const [addonDescription, setAddonDescription] = useState("");
  const [draftAddons, setDraftAddons] = useState<OnboardingServiceAddon[]>([]);
  const [pricingOptions, setPricingOptions] = useState<PricingOption[]>([DEFAULT_PRICING_OPTION()]);
  // §provider-onboarding-2026-05: Catalog-parity advanced fields. These ride
  // through to `/api/provider/onboarding` so providers don't have to revisit
  // every service in the catalog after going live.
  const [serviceType, setServiceType] = useState<string>("basic");
  const [pricingName, setPricingName] = useState("");
  const [aftercareDescription, setAftercareDescription] = useState("");
  const [availableFor, setAvailableFor] = useState<string>("everyone");
  const [onlineBookable, setOnlineBookable] = useState(true);
  const [atHomeRadius, setAtHomeRadius] = useState("");
  const [atHomePriceAdj, setAtHomePriceAdj] = useState("0");
  const [taxRate, setTaxRate] = useState("0");
  const [extraTimeEnabled, setExtraTimeEnabled] = useState(false);
  const [extraTimeDuration, setExtraTimeDuration] = useState("15");
  const services = formData.services || [];
  const selectedCategoryIds = useMemo(
    () => formData.global_category_ids || [],
    [formData.global_category_ids],
  );
  const selectedCategories = allCats.filter((cat) => selectedCategoryIds.includes(cat.id));
  const categoryNameById = new Map(selectedCategories.map((cat) => [cat.id, cat.name]));

  useEffect(() => {
    (async () => {
      const res = await api.get<Cat[]>("/api/public/categories/global?all=true");
      setAllCats(Array.isArray(res.data) ? res.data : []);
      setLoadingCats(false);
    })();
  }, []);

  useEffect(() => {
    if (categoryId && selectedCategoryIds.includes(categoryId)) return;
    if (selectedCategoryIds.length > 0) setCategoryId(selectedCategoryIds[0]);
    else setCategoryId("");
  }, [categoryId, selectedCategoryIds]);

  useEffect(() => {
    setSupportsAtSalon(formData.business_type !== "mobile");
    setSupportsAtHome(formData.business_type !== "salon");
  }, [formData.business_type]);

  const addAddon = () => {
    const parsedAddonPrice = parseFloat(addonPrice);
    const parsedAddonDuration = addonDuration ? parseInt(addonDuration, 10) : undefined;
    if (!addonName.trim()) {
      Alert.alert("Add-on", "Enter an add-on name.");
      return;
    }
    if (Number.isNaN(parsedAddonPrice) || parsedAddonPrice < 0) {
      Alert.alert("Add-on", "Enter a valid add-on price.");
      return;
    }
    setDraftAddons((prev) => [
      ...prev,
      {
        parent_service_index: services.length,
        name: addonName.trim(),
        description: addonDescription.trim() || undefined,
        price: parsedAddonPrice,
        currency: tenantCurrency,
        duration_minutes:
          parsedAddonDuration && parsedAddonDuration > 0 ? parsedAddonDuration : undefined,
      },
    ]);
    setAddonName("");
    setAddonPrice("");
    setAddonDuration("");
    setAddonDescription("");
  };

  const add = () => {
    if (!selectedCategoryIds.length) {
      Alert.alert("Service", "Select at least one category in the previous step first.");
      return;
    }
    if (!categoryId) {
      Alert.alert("Service", "Select a category to continue.");
      return;
    }
    if (!title.trim()) {
      Alert.alert("Service", "Enter a service name.");
      return;
    }
    const primaryPricing = pricingOptions[0] ?? DEFAULT_PRICING_OPTION();
    if (primaryPricing.price <= 0) {
      Alert.alert("Service", "Enter a valid service price.");
      return;
    }
    if (!primaryPricing.duration || primaryPricing.duration <= 0) {
      Alert.alert("Service", "Duration must be more than 0 minutes.");
      return;
    }
    if (!supportsAtSalon && !supportsAtHome) {
      Alert.alert("Service", "Choose at least one availability option: salon or at-home.");
      return;
    }
    const parsedRadius = parseFloat(atHomeRadius);
    const parsedAdj = parseFloat(atHomePriceAdj);
    const parsedTax = parseFloat(taxRate);
    const parsedExtraDur = parseInt(extraTimeDuration, 10);
    const s: OnboardingService = {
      title: title.trim(),
      category_id: categoryId,
      description: description.trim() || undefined,
      duration_minutes: primaryPricing.duration,
      price: primaryPricing.price,
      currency: tenantCurrency,
      supports_at_home: supportsAtHome,
      supports_at_salon: supportsAtSalon,
      service_type: serviceType || "basic",
      pricing_name: primaryPricing.pricingName.trim() || pricingName.trim() || undefined,
      pricing_options: pricingOptionsToPayload(pricingOptions),
      aftercare_description: aftercareDescription.trim() || undefined,
      service_available_for: availableFor || "everyone",
      online_booking_enabled: onlineBookable,
      at_home_radius_km:
        supportsAtHome && Number.isFinite(parsedRadius) && parsedRadius > 0
          ? parsedRadius
          : undefined,
      at_home_price_adjustment:
        supportsAtHome && Number.isFinite(parsedAdj) ? parsedAdj : 0,
      tax_rate: Number.isFinite(parsedTax) ? parsedTax : 0,
      extra_time_enabled: extraTimeEnabled,
      extra_time_duration:
        extraTimeEnabled && Number.isFinite(parsedExtraDur) && parsedExtraDur > 0
          ? parsedExtraDur
          : 0,
    };
    const nextAddons = [
      ...(formData.service_addons || []),
      ...draftAddons.map((a) => ({ ...a, parent_service_index: services.length })),
    ];
    updateFormData({ services: [...services, s], service_addons: nextAddons });
    setTitle("");
    setDescription("");
    setShowAdvanced(false);
    setSupportsAtSalon(formData.business_type !== "mobile");
    setSupportsAtHome(formData.business_type !== "salon");
    setDraftAddons([]);
    setPricingOptions([DEFAULT_PRICING_OPTION()]);
    setServiceType("basic");
    setPricingName("");
    setAftercareDescription("");
    setAvailableFor("everyone");
    setOnlineBookable(true);
    setAtHomeRadius("");
    setAtHomePriceAdj("0");
    setTaxRate("0");
    setExtraTimeEnabled(false);
    setExtraTimeDuration("15");
  };

  const remove = (i: number) => {
    const next = [...services];
    next.splice(i, 1);
    updateFormData({ services: next });
  };

  return (
    <View style={twStyle("gap-4")}>
      <View
        style={twStyle(
          "rounded-[1.5rem] border border-sky-200 bg-sky-50 p-5 flex-row gap-3 shadow-sm"
        )}
      >
        <Ionicons
          name="information-circle-outline"
          size={20}
          color="#0284c7"
          style={{ marginTop: 2 }}
        />
        <View style={twStyle("flex-1")}>
          <Text style={twStyle("text-[15px] font-semibold text-sky-900")}>
            Add services now or skip
          </Text>
          <Text style={twStyle("mt-1 text-[14px] leading-relaxed text-sky-800")}>
            If you skip, we&apos;ll draft starter services from your selected categories.
          </Text>
        </View>
      </View>

      {services.map((s, i) => (
        <View
          key={`${s.title}-${i}`}
          style={twStyle(
            "rounded-[1.5rem] border border-slate-200 bg-white p-5 flex-row items-center gap-4 shadow-sm"
          )}
        >
          <View style={twStyle("h-12 w-12 items-center justify-center rounded-full bg-emerald-50")}>
            <Ionicons name="cut-outline" size={20} color="#059669" />
          </View>
          <View style={twStyle("flex-1 pr-2")}>
            <Text style={twStyle("text-[17px] font-semibold text-slate-900")}>{s.title}</Text>
            <Text style={twStyle("mt-1 text-[13px] font-medium text-slate-500")}>
              {s.category_id ? categoryNameById.get(s.category_id) || "Category" : "No category"}
            </Text>
            <Text style={twStyle("mt-0.5 text-[13px] text-slate-400")}>
              {s.duration_minutes} min · {s.currency || tenantCurrency} {s.price}
              {s.supports_at_salon ? " · Salon" : ""}
              {s.supports_at_home ? " · Home" : ""}
              {(() => {
                const addonCount = (formData.service_addons || []).filter(
                  (a) => a.parent_service_index === i,
                ).length;
                return addonCount
                  ? ` · ${addonCount} add-on${addonCount === 1 ? "" : "s"}`
                  : "";
              })()}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => remove(i)}
            style={twStyle("h-10 w-10 items-center justify-center rounded-full bg-rose-50")}
          >
            <Ionicons name="trash-outline" size={18} color="#e11d48" />
          </TouchableOpacity>
        </View>
      ))}

      {loadingCats ? (
        <View style={twStyle("py-8 items-center")}>
          <ActivityIndicator color="#0f172a" size="small" />
        </View>
      ) : null}

      <View
        style={twStyle("rounded-[1.5rem] border border-slate-200 bg-white p-5 gap-4 shadow-sm")}
      >
        <Text style={twStyle("text-[17px] font-semibold text-slate-900")}>Add a service</Text>
        <Text style={twStyle(labelCls)}>Category</Text>
        {selectedCategories.length > 0 ? (
          <View style={twStyle("flex-row flex-wrap gap-2")}>
            {selectedCategories.map((cat) => {
              const selected = categoryId === cat.id;
              return (
                <TouchableOpacity
                  key={cat.id}
                  onPress={() => setCategoryId(cat.id)}
                  style={twStyle(
                    `rounded-full border px-4 py-2 transition-all duration-300 ${selected ? "border-primary bg-primary shadow-sm" : "border-slate-200 bg-slate-50"}`
                  )}
                >
                  <Text
                    style={twStyle(
                      `text-[14px] font-medium ${selected ? "text-white" : "text-slate-700"}`
                    )}
                  >
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <View
            style={twStyle(
              "flex-row gap-3 rounded-[1.5rem] border border-amber-200 bg-amber-50 p-4"
            )}
          >
            <Ionicons name="alert-circle-outline" size={20} color="#92400e" />
            <Text style={twStyle("flex-1 text-[14px] text-amber-900 leading-relaxed")}>
              Select categories in the previous step first.
            </Text>
          </View>
        )}
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Service name"
          style={twStyle(inputCls)}
          placeholderTextColor="#94a3b8"
        />
        <View style={twStyle("flex-row gap-3")}>
          <TextInput
            value={pricingOptions[0]?.price > 0 ? String(pricingOptions[0].price) : ""}
            onChangeText={(t) => {
              const val = parseFloat(t) || 0;
              setPricingOptions((prev) =>
                prev.map((o, i) => (i === 0 ? { ...o, price: val } : o))
              );
            }}
            placeholder={`Price (${tenantCurrency})`}
            keyboardType="decimal-pad"
            style={twStyle(`${inputCls} flex-1`)}
            placeholderTextColor="#94a3b8"
          />
          <TextInput
            value={pricingOptions[0]?.duration > 0 ? String(pricingOptions[0].duration) : ""}
            onChangeText={(t) => {
              const val = parseInt(t, 10) || 0;
              setPricingOptions((prev) =>
                prev.map((o, i) => (i === 0 ? { ...o, duration: val } : o))
              );
            }}
            placeholder="Minutes"
            keyboardType="number-pad"
            style={twStyle(`${inputCls} w-32`)}
            placeholderTextColor="#94a3b8"
          />
        </View>

        {supportsAtHome ? (
          <View style={twStyle("rounded-[1.5rem] border border-emerald-200 bg-emerald-50 p-4 gap-3")}>
            <View style={twStyle("flex-row items-center gap-2 mb-1")}>
              <Ionicons name="home-outline" size={16} color="#047857" />
              <Text style={twStyle("text-[14px] font-semibold text-emerald-900")}>
                Home visit settings
              </Text>
            </View>
            <View style={twStyle("rounded-2xl border border-emerald-100 bg-white p-3 flex-row gap-2")}>
              <Ionicons name="information-circle-outline" size={15} color="#059669" style={{ marginTop: 1 }} />
              <Text style={twStyle("flex-1 text-[12px] leading-5 text-emerald-800")}>
                No travel distance limit by default — customers anywhere can book. Set a max km to restrict range.
              </Text>
            </View>
            <View style={twStyle("flex-row gap-3")}>
              <View style={twStyle("flex-1 gap-1")}>
                <Text style={twStyle("text-[12px] font-medium text-slate-600")}>Max travel radius (km)</Text>
                <TextInput
                  value={atHomeRadius}
                  onChangeText={setAtHomeRadius}
                  placeholder="Unlimited"
                  keyboardType="decimal-pad"
                  style={twStyle(inputCls)}
                  placeholderTextColor="#94a3b8"
                />
              </View>
              <View style={twStyle("w-36 gap-1")}>
                <Text style={twStyle("text-[12px] font-medium text-slate-600")}>Travel surcharge ({tenantCurrency})</Text>
                <TextInput
                  value={atHomePriceAdj}
                  onChangeText={setAtHomePriceAdj}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  style={twStyle(inputCls)}
                  placeholderTextColor="#94a3b8"
                />
              </View>
            </View>
          </View>
        ) : null}

        <TouchableOpacity
          onPress={() => setShowAdvanced((prev) => !prev)}
          style={twStyle(
            "flex-row items-center justify-between rounded-[1.5rem] border border-slate-200 bg-slate-50 px-5 py-4"
          )}
          accessibilityRole="button"
          accessibilityLabel={
            showAdvanced ? "Hide advanced service settings" : "Show advanced service settings"
          }
        >
          <Text style={twStyle("text-[15px] font-semibold text-slate-700")}>
            Advanced service settings
          </Text>
          <Ionicons name={showAdvanced ? "chevron-up" : "chevron-down"} size={20} color="#64748b" />
        </TouchableOpacity>

        {showAdvanced ? (
          <View style={twStyle("gap-4 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4")}>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Description (optional)"
              style={twStyle(`${inputCls} min-h-[100px] pt-4`)}
              multiline
              numberOfLines={3}
              placeholderTextColor="#94a3b8"
            />

            <View style={twStyle("rounded-[1.5rem] border border-slate-200 bg-white p-4 gap-3")}>
              <Text style={twStyle("text-[13px] font-semibold uppercase tracking-wide text-slate-500")}>
                Service type
              </Text>
              <View style={twStyle("flex-row flex-wrap gap-2")}>
                {SERVICE_TYPE_OPTIONS.map((opt) => {
                  const selected = serviceType === opt.value;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      onPress={() => setServiceType(opt.value)}
                      style={twStyle(
                        `rounded-full border px-4 py-2 ${selected ? "border-primary bg-primary" : "border-slate-200 bg-white"}`
                      )}
                      accessibilityRole="button"
                      accessibilityLabel={`Service type ${opt.label}`}
                      accessibilityState={{ selected }}
                    >
                      <Text
                        style={twStyle(
                          `text-[14px] font-medium ${selected ? "text-white" : "text-slate-700"}`
                        )}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <PricingOptionsEditor
                options={pricingOptions}
                onChange={setPricingOptions}
                durationOptions={[{ value: "60", label: "60 min" }, { value: "30", label: "30 min" }, { value: "90", label: "90 min" }]}
                priceTypeOptions={[{ value: "fixed", label: "Fixed" }]}
              />
            </View>

            <View style={twStyle("rounded-[1.5rem] border border-slate-200 bg-white p-4 gap-3")}>
              <Text style={twStyle("text-[13px] font-semibold uppercase tracking-wide text-slate-500")}>
                Available for
              </Text>
              <View style={twStyle("flex-row flex-wrap gap-2")}>
                {AVAILABILITY_OPTIONS.map((opt) => {
                  const selected = availableFor === opt.value;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      onPress={() => setAvailableFor(opt.value)}
                      style={twStyle(
                        `rounded-full border px-4 py-2 ${selected ? "border-primary bg-primary" : "border-slate-200 bg-white"}`
                      )}
                      accessibilityRole="button"
                      accessibilityLabel={`Available for ${opt.label}`}
                      accessibilityState={{ selected }}
                    >
                      <Text
                        style={twStyle(
                          `text-[14px] font-medium ${selected ? "text-white" : "text-slate-700"}`
                        )}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={twStyle("rounded-[1.5rem] border border-slate-200 bg-white p-4 gap-4")}>
              <View style={twStyle("flex-row items-center justify-between")}>
                <View style={twStyle("flex-1 pr-3")}>
                  <Text style={twStyle("text-[15px] font-medium text-slate-800")}>
                    Online bookings
                  </Text>
                  <Text style={twStyle("mt-0.5 text-[12px] text-slate-500")}>
                    Allow customers to book this service from your app or web profile.
                  </Text>
                </View>
                <Switch
                  value={onlineBookable}
                  onValueChange={setOnlineBookable}
                  trackColor={{ false: "#cbd5e1", true: Colors.primary }}
                  accessibilityLabel="Online booking enabled"
                />
              </View>
              <View style={twStyle("flex-row items-center justify-between")}>
                <Text style={twStyle("text-[15px] font-medium text-slate-800")}>
                  Available at salon
                </Text>
                <Switch
                  value={supportsAtSalon}
                  onValueChange={setSupportsAtSalon}
                  trackColor={{ false: "#cbd5e1", true: Colors.primary }}
                />
              </View>
              <View style={twStyle("flex-row items-center justify-between")}>
                <Text style={twStyle("text-[15px] font-medium text-slate-800")}>
                  Available at home
                </Text>
                <Switch
                  value={supportsAtHome}
                  onValueChange={setSupportsAtHome}
                  trackColor={{ false: "#cbd5e1", true: Colors.primary }}
                />
              </View>
            </View>

            <View style={twStyle("rounded-[1.5rem] border border-slate-200 bg-white p-4 gap-3")}>
              <Text style={twStyle("text-[13px] font-semibold uppercase tracking-wide text-slate-500")}>
                Tax rate
              </Text>
              <View style={twStyle("flex-row flex-wrap gap-2")}>
                {TAX_RATE_OPTIONS.map((opt) => {
                  const selected = taxRate === opt.value;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      onPress={() => setTaxRate(opt.value)}
                      style={twStyle(
                        `rounded-full border px-4 py-2 ${selected ? "border-primary bg-primary" : "border-slate-200 bg-white"}`
                      )}
                      accessibilityRole="button"
                      accessibilityLabel={`Tax rate ${opt.label}`}
                      accessibilityState={{ selected }}
                    >
                      <Text
                        style={twStyle(
                          `text-[14px] font-medium ${selected ? "text-white" : "text-slate-700"}`
                        )}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={twStyle("rounded-[1.5rem] border border-slate-200 bg-white p-4 gap-3")}>
              <View style={twStyle("flex-row items-center justify-between")}>
                <View style={twStyle("flex-1 pr-3")}>
                  <Text style={twStyle("text-[15px] font-medium text-slate-800")}>
                    Reserve extra time
                  </Text>
                  <Text style={twStyle("mt-0.5 text-[12px] text-slate-500")}>
                    Block the calendar after this service for cleanup, transition, or buffer.
                  </Text>
                </View>
                <Switch
                  value={extraTimeEnabled}
                  onValueChange={setExtraTimeEnabled}
                  trackColor={{ false: "#cbd5e1", true: Colors.primary }}
                  accessibilityLabel="Reserve extra time"
                />
              </View>
              {extraTimeEnabled ? (
                <TextInput
                  value={extraTimeDuration}
                  onChangeText={setExtraTimeDuration}
                  placeholder="Buffer (min)"
                  keyboardType="number-pad"
                  style={twStyle(inputCls)}
                  placeholderTextColor="#94a3b8"
                />
              ) : null}
            </View>

            <View style={twStyle("rounded-[1.5rem] border border-slate-200 bg-white p-4 gap-3")}>
              <Text style={twStyle("text-[13px] font-semibold uppercase tracking-wide text-slate-500")}>
                Aftercare notes (optional)
              </Text>
              <TextInput
                value={aftercareDescription}
                onChangeText={setAftercareDescription}
                placeholder="Sent to customers after the booking is complete"
                style={twStyle(`${inputCls} min-h-[88px] pt-4`)}
                multiline
                numberOfLines={3}
                placeholderTextColor="#94a3b8"
              />
            </View>

            <View style={twStyle("rounded-[1.5rem] border border-slate-200 bg-white p-4 gap-3")}>
              <Text style={twStyle("text-[15px] font-semibold text-slate-900 mb-1")}>
                Add-ons (optional)
              </Text>
              {draftAddons.map((addon, idx) => (
                <View
                  key={`${addon.name}-${idx}`}
                  style={twStyle(
                    "flex-row items-center justify-between rounded-[1rem] bg-slate-50 px-4 py-3"
                  )}
                >
                  <View style={twStyle("flex-1 pr-3")}>
                    <Text style={twStyle("text-[15px] font-medium text-slate-900")}>
                      {addon.name}
                    </Text>
                    <Text style={twStyle("mt-0.5 text-[13px] text-slate-500")}>
                      {addon.currency || tenantCurrency} {addon.price}
                      {addon.duration_minutes ? ` · +${addon.duration_minutes} min` : ""}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setDraftAddons((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    <Ionicons name="close-circle" size={22} color="#e11d48" />
                  </TouchableOpacity>
                </View>
              ))}
              <TextInput
                value={addonName}
                onChangeText={setAddonName}
                placeholder="Add-on name"
                style={twStyle(inputCls)}
                placeholderTextColor="#94a3b8"
              />
              <View style={twStyle("flex-row gap-3")}>
                <TextInput
                  value={addonPrice}
                  onChangeText={setAddonPrice}
                  placeholder={`Price (${tenantCurrency})`}
                  keyboardType="decimal-pad"
                  style={twStyle(`${inputCls} flex-1`)}
                  placeholderTextColor="#94a3b8"
                />
                <TextInput
                  value={addonDuration}
                  onChangeText={setAddonDuration}
                  placeholder="+ min"
                  keyboardType="number-pad"
                  style={twStyle(`${inputCls} w-24`)}
                  placeholderTextColor="#94a3b8"
                />
              </View>
              <TextInput
                value={addonDescription}
                onChangeText={setAddonDescription}
                placeholder="Add-on description (optional)"
                style={twStyle(inputCls)}
                placeholderTextColor="#94a3b8"
              />
              <TouchableOpacity
                onPress={addAddon}
                style={twStyle(
                  "flex-row items-center justify-center gap-2 rounded-[1.5rem] border-2 border-primary bg-white py-3.5 mt-1"
                )}
              >
                <Ionicons name="add" size={18} color={Colors.primary} />
                <Text style={twStyle("text-[15px] font-semibold text-primary")}>Add add-on</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
      </View>

      <TouchableOpacity
        onPress={add}
        style={twStyle(
          "flex-row items-center justify-center gap-2 rounded-full bg-primary py-4 shadow-sm"
        )}
      >
        <Ionicons name="add-circle-outline" size={22} color="#fff" />
        <Text style={twStyle("text-[16px] font-semibold text-white")}>Add service</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Step 12: Hours ──────────────────────────────────────────────────────────

const DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;
const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

type HoursPickerState = {
  day: string;
  field: "open" | "close";
  time: string;
};

function minutesFromTime(time: string): number {
  const [h, m] = time.split(":");
  return Number(h ?? 0) * 60 + Number(m ?? 0);
}

function Step12Hours() {
  const { formData, updateFormData } = useOnboardingWizard();
  const oh = formData.operating_hours || {};
  const isFreelancer = formData.business_type === "mobile" || formData.team_size === "freelancer";

  // §provider-onboarding-hours 2026-05: single picker state record so we
  // never read stale `pickerDay/showPicker` after Android dismisses the
  // native dialog and resets them in the same JS tick.
  const [picker, setPicker] = useState<HoursPickerState | null>(null);

  useEffect(() => {
    if (
      isFreelancer &&
      (!formData.operating_hours || Object.keys(formData.operating_hours).length === 0)
    ) {
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

  const setDay = (
    day: string,
    patch: Partial<{ open: string; close: string; closed: boolean }>
  ) => {
    const cur = oh[day] || { open: "09:00", close: "18:00", closed: false };
    updateFormData({ operating_hours: { ...oh, [day]: { ...cur, ...patch } } });
  };

  const toggleDay = (day: string) => {
    Haptics.selectionAsync();
    const cur = oh[day] || { open: "09:00", close: "18:00", closed: false };
    setDay(day, { closed: !cur.closed });
  };

  const openPicker = (day: string, field: "open" | "close") => {
    const cur = oh[day] || { open: "09:00", close: "18:00", closed: false };
    const fallback = field === "open" ? "09:00" : "18:00";
    const time = (field === "open" ? cur.open : cur.close) || fallback;
    Haptics.selectionAsync();
    setPicker({ day, field, time });
  };

  const handleTimeChange = (
    event: { type?: string } | unknown,
    d?: Date,
  ) => {
    const current = picker;
    const eventType = (event as { type?: string } | undefined)?.type;
    // The picker now lives inside a Modal with its own Done button, so we
    // never auto-dismiss — only the "dismissed" event (Android back button)
    // closes it. The spinner display fires onChange continuously as the user
    // scrolls; we just keep updating the preview time.
    if (eventType === "dismissed") {
      setPicker(null);
      return;
    }
    if (!d || !current) return;

    const timeStr = `${String(d.getHours()).padStart(2, "0")}:${String(
      d.getMinutes(),
    ).padStart(2, "0")}`;

    // Keep picker preview time in sync with the spinner scroll position.
    setPicker((prev) => (prev ? { ...prev, time: timeStr } : prev));

    // §provider-onboarding-hours 2026-05: prevent inverted ranges so providers
    // don't end up with a saved "open after close" schedule that silently
    // breaks bookings later.
    const cur = oh[current.day] || { open: "09:00", close: "18:00", closed: false };
    if (current.field === "open") {
      const closeMins = minutesFromTime(cur.close || "18:00");
      const newMins = minutesFromTime(timeStr);
      if (newMins >= closeMins) {
        Alert.alert(
          "Opening time too late",
          "Opening time must be earlier than closing time.",
        );
        return;
      }
      setDay(current.day, { open: timeStr });
    } else {
      const openMins = minutesFromTime(cur.open || "09:00");
      const newMins = minutesFromTime(timeStr);
      if (newMins <= openMins) {
        Alert.alert(
          "Closing time too early",
          "Closing time must be later than opening time.",
        );
        return;
      }
      setDay(current.day, { close: timeStr });
    }
  };

  const copyToAll = (sourceDay: string) => {
    const src = oh[sourceDay] || { open: "09:00", close: "18:00", closed: false };
    const newHours: typeof oh = {};
    for (const day of DAYS) newHours[day] = { ...src };
    updateFormData({ operating_hours: newHours });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  return (
    <View style={twStyle("gap-3")}>
      <View
        style={twStyle(
          `rounded-2xl border p-4 flex-row gap-2 ${isFreelancer ? "border-emerald-200 bg-emerald-50" : "border-indigo-100 bg-indigo-50"}`
        )}
      >
        <Ionicons
          name="information-circle"
          size={18}
          color={isFreelancer ? "#047857" : "#4338ca"}
          style={{ marginTop: 1 }}
        />
        <Text
          style={twStyle(
            `flex-1 text-sm leading-5 ${isFreelancer ? "text-emerald-900" : "text-indigo-900"}`
          )}
        >
          {isFreelancer
            ? "We've started you on broad weekday hours (8 am–8 pm). Tap a day to toggle open/closed, then set times."
            : "Clients can only book slots within these hours. Tap a day to toggle it, then set the times."}
        </Text>
      </View>

      {/* Quick summary chips — tappable to toggle open/closed for fast setup */}
      <View style={twStyle("flex-row flex-wrap gap-1.5 mb-2")}>
        {DAYS.map((day, i) => {
          const h = oh[day];
          const open = !!(h && !h.closed);
          return (
            <TouchableOpacity
              key={day}
              onPress={() => toggleDay(day)}
              accessibilityRole="button"
              accessibilityLabel={`Toggle ${day} ${open ? "closed" : "open"}`}
              accessibilityState={{ selected: open }}
              activeOpacity={0.7}
              style={twStyle(
                `rounded-full px-3 py-1.5 ${open ? "bg-primary shadow-sm" : "bg-slate-100"}`,
              )}
            >
              <Text
                style={twStyle(
                  `text-[13px] font-semibold ${open ? "text-white" : "text-slate-500"}`,
                )}
              >
                {DAY_SHORT[i]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {DAYS.map((day) => {
        const h = oh[day] || { open: "09:00", close: "18:00", closed: false };
        return (
          <View
            key={day}
            style={twStyle("rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm")}
          >
            <View style={twStyle("flex-row items-center justify-between")}>
              <TouchableOpacity
                onPress={() => toggleDay(day)}
                accessibilityRole="button"
                accessibilityLabel={`Toggle ${day} ${h.closed ? "open" : "closed"}`}
                accessibilityState={{ selected: !h.closed }}
                activeOpacity={0.7}
                style={twStyle("flex-1 pr-3")}
              >
                <Text style={twStyle("text-[17px] font-semibold capitalize text-slate-900")}>
                  {day}
                </Text>
                <Text
                  style={twStyle(
                    `mt-1 text-[12px] font-medium ${h.closed ? "text-slate-400" : "text-emerald-600"}`,
                  )}
                >
                  Tap to {h.closed ? "open this day" : "mark closed"}
                </Text>
              </TouchableOpacity>
              <View style={twStyle("flex-row items-center gap-3")}>
                {!h.closed ? (
                  <TouchableOpacity
                    onPress={() => copyToAll(day)}
                    style={twStyle("px-2 py-1")}
                    accessibilityRole="button"
                    accessibilityLabel={`Copy ${day} hours to all days`}
                  >
                    <Text style={twStyle("text-[13px] font-semibold text-slate-500")}>
                      Copy all
                    </Text>
                  </TouchableOpacity>
                ) : null}
                <Text
                  style={twStyle(
                    `text-[14px] font-medium ${h.closed ? "text-slate-400" : "text-slate-700"}`
                  )}
                >
                  {h.closed ? "Closed" : "Open"}
                </Text>
                <Switch
                  value={!h.closed}
                  onValueChange={(v) => setDay(day, { closed: !v })}
                  trackColor={{ false: "#cbd5e1", true: Colors.primary }}
                  accessibilityLabel={`${day} open switch`}
                />
              </View>
            </View>
            {!h.closed ? (
              <View style={twStyle("mt-4 flex-row gap-3")}>
                <TouchableOpacity
                  onPress={() => openPicker(day, "open")}
                  style={twStyle(
                    "flex-1 flex-row items-center justify-center gap-2 rounded-[1rem] border border-slate-200 bg-slate-50 py-3"
                  )}
                  accessibilityRole="button"
                  accessibilityLabel={`Set opening time for ${day}, currently ${h.open || "09:00"}`}
                >
                  <Ionicons name="time-outline" size={18} color="#64748b" />
                  <Text style={twStyle("text-[16px] font-semibold text-slate-900")}>
                    {h.open || "09:00"}
                  </Text>
                </TouchableOpacity>
                <View style={twStyle("items-center justify-center")}>
                  <Text style={twStyle("text-[15px] font-medium text-slate-400")}>to</Text>
                </View>
                <TouchableOpacity
                  onPress={() => openPicker(day, "close")}
                  style={twStyle(
                    "flex-1 flex-row items-center justify-center gap-2 rounded-[1rem] border border-slate-200 bg-slate-50 py-3"
                  )}
                  accessibilityRole="button"
                  accessibilityLabel={`Set closing time for ${day}, currently ${h.close || "18:00"}`}
                >
                  <Ionicons name="time-outline" size={18} color="#64748b" />
                  <Text style={twStyle("text-[16px] font-semibold text-slate-900")}>
                    {h.close || "18:00"}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        );
      })}

      <Modal
        visible={!!picker}
        transparent
        animationType="slide"
        onRequestClose={() => setPicker(null)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)" }}
          onPress={() => setPicker(null)}
        >
          <View
            onStartShouldSetResponder={() => true}
            style={twStyle(
              "absolute bottom-0 left-0 right-0 rounded-t-3xl bg-white px-5 pb-10 pt-5"
            )}
          >
            <View style={twStyle("mb-1 flex-row items-center justify-between")}>
              <Text style={twStyle("text-[17px] font-semibold capitalize text-slate-900")}>
                {picker?.field === "open" ? "Opening time" : "Closing time"}
                {picker?.day ? ` — ${picker.day}` : ""}
              </Text>
              <TouchableOpacity
                onPress={() => setPicker(null)}
                accessibilityRole="button"
                accessibilityLabel="Done picking time"
                style={twStyle("px-2 py-1")}
              >
                <Text style={twStyle("text-[16px] font-semibold text-primary")}>Done</Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker
              value={new Date(`2000-01-01T${picker?.time ?? "09:00"}:00`)}
              mode="time"
              is24Hour={false}
              display="spinner"
              onChange={handleTimeChange}
            />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

// ─── Step 13: Review ─────────────────────────────────────────────────────────

type ReviewRowProps = {
  icon: ComponentProps<typeof Ionicons>["name"];
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
  ok?: boolean;
};

function ReviewRow({ icon, iconBg, iconColor, label, value, ok }: ReviewRowProps) {
  return (
    <View
      style={twStyle("flex-row items-center gap-4 py-3.5 border-b border-slate-100 last:border-0")}
    >
      <View
        style={[
          twStyle("h-11 w-11 items-center justify-center rounded-full"),
          { backgroundColor: iconBg },
        ]}
      >
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>
      <View style={twStyle("flex-1 min-w-0")}>
        <Text
          style={twStyle(
            "text-[12px] font-semibold uppercase tracking-wider text-slate-500 mb-0.5"
          )}
        >
          {label}
        </Text>
        <Text style={twStyle("text-[15px] font-medium text-slate-900")} numberOfLines={2}>
          {value}
        </Text>
      </View>
      {ok !== undefined ? (
        <Ionicons
          name={ok ? "checkmark-circle" : "alert-circle-outline"}
          size={22}
          color={ok ? "#10b981" : "#f59e0b"}
        />
      ) : null}
    </View>
  );
}

function Step13Review() {
  const { formData } = useOnboardingWizard();
  const a = formData.address;
  const hasRequiredPhotos = !!(formData.thumbnail_url && formData.avatar_url);
  const catCount = (formData.global_category_ids || []).length;
  const svcCount = (formData.services || []).length;
  const openDayCount = Object.values(formData.operating_hours || {}).filter(
    (h) => !h.closed
  ).length;

  const bizTypeLabel =
    formData.business_type === "salon"
      ? "Salon / studio"
      : formData.business_type === "mobile"
        ? "Mobile / at-home"
        : "Salon + Mobile";

  return (
    <View style={twStyle("gap-4")}>
      <View
        style={twStyle(
          "rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex-row gap-2 items-center"
        )}
      >
        <Ionicons name="rocket-outline" size={18} color="#047857" />
        <Text style={twStyle("flex-1 text-sm font-semibold text-emerald-900")}>
          You&apos;re almost there! Review your details then hit Submit.
        </Text>
      </View>

      {/* Identity */}
      <View style={twStyle("rounded-2xl border-2 border-gray-200 bg-white p-4")}>
        <Text style={twStyle("mb-1 text-xs font-bold uppercase tracking-wide text-gray-400")}>
          Your identity
        </Text>
        <ReviewRow
          icon="person-outline"
          iconBg="#f0f9ff"
          iconColor="#0284c7"
          label="Name"
          value={formData.owner_name || "—"}
          ok={!!formData.owner_name}
        />
        <ReviewRow
          icon="mail-outline"
          iconBg="#f0f9ff"
          iconColor="#0284c7"
          label="Email"
          value={formData.owner_email || "—"}
          ok={!!formData.owner_email}
        />
        <ReviewRow
          icon="phone-portrait-outline"
          iconBg={formData.phone_verified ? "#f0fdf4" : "#fffbeb"}
          iconColor={formData.phone_verified ? "#16a34a" : "#d97706"}
          label="Mobile"
          value={formData.owner_phone || "—"}
          ok={formData.phone_verified}
        />
      </View>

      {/* Business */}
      <View style={twStyle("rounded-2xl border-2 border-gray-200 bg-white p-4")}>
        <Text style={twStyle("mb-1 text-xs font-bold uppercase tracking-wide text-gray-400")}>
          Business
        </Text>
        <ReviewRow
          icon="briefcase-outline"
          iconBg="#fdf4ff"
          iconColor="#9333ea"
          label="Name"
          value={formData.business_name || "—"}
          ok={!!formData.business_name}
        />
        <ReviewRow
          icon="storefront-outline"
          iconBg="#fdf4ff"
          iconColor="#9333ea"
          label="Type"
          value={bizTypeLabel}
        />
        {formData.description ? (
          <ReviewRow
            icon="document-text-outline"
            iconBg="#fdf4ff"
            iconColor="#9333ea"
            label="Description"
            value={
              formData.description.slice(0, 80) + (formData.description.length > 80 ? "…" : "")
            }
            ok
          />
        ) : (
          <ReviewRow
            icon="document-text-outline"
            iconBg="#fdf4ff"
            iconColor="#9333ea"
            label="Description"
            value="Not added — recommended"
            ok={false}
          />
        )}
      </View>

      {/* Location & hours */}
      <View style={twStyle("rounded-2xl border-2 border-gray-200 bg-white p-4")}>
        <Text style={twStyle("mb-1 text-xs font-bold uppercase tracking-wide text-gray-400")}>
          Location & hours
        </Text>
        <ReviewRow
          icon="location-outline"
          iconBg="#f0fdf4"
          iconColor="#16a34a"
          label="Address"
          value={a?.line1 ? `${a.line1}, ${a.city}` : "Not set"}
          ok={!!(a?.line1 && a?.city)}
        />
        <ReviewRow
          icon="time-outline"
          iconBg="#f0fdf4"
          iconColor="#16a34a"
          label="Open days"
          value={`${openDayCount} of 7 days`}
          ok={openDayCount > 0}
        />
      </View>

      {/* Categories & services */}
      <View style={twStyle("rounded-2xl border-2 border-gray-200 bg-white p-4")}>
        <Text style={twStyle("mb-1 text-xs font-bold uppercase tracking-wide text-gray-400")}>
          Catalogue
        </Text>
        <ReviewRow
          icon="pricetag-outline"
          iconBg="#fffbeb"
          iconColor="#d97706"
          label="Categories"
          value={catCount > 0 ? `${catCount} selected` : "None selected"}
          ok={catCount > 0}
        />
        <ReviewRow
          icon="cut-outline"
          iconBg="#fffbeb"
          iconColor="#d97706"
          label="Services"
          value={svcCount > 0 ? `${svcCount} added` : "Auto-generated from categories"}
          ok={svcCount >= 0}
        />
        <ReviewRow
          icon="images-outline"
          iconBg="#fffbeb"
          iconColor="#d97706"
          label="Photos"
          value={hasRequiredPhotos ? "Thumbnail + profile image uploaded" : "Thumbnail and profile image required"}
          ok={hasRequiredPhotos}
        />
      </View>

      {/* Plan */}
      {formData.selected_plan_name ? (
        <View style={twStyle("rounded-2xl border-2 border-gray-200 bg-white p-4")}>
          <Text style={twStyle("mb-1 text-xs font-bold uppercase tracking-wide text-gray-400")}>
            Plan
          </Text>
          <ReviewRow
            icon="star-outline"
            iconBg="#fdf4ff"
            iconColor="#9333ea"
            label="Selected plan"
            value={formData.selected_plan_name}
            ok
          />
        </View>
      ) : null}
    </View>
  );
}

// ─── Step 14: Plan ───────────────────────────────────────────────────────────

type PlanRow = {
  id: string;
  name: string;
  price: string;
  period: string | null;
  description: string | null;
  is_popular: boolean;
  features: string[];
  is_free?: boolean;
};

const FEATURE_PREVIEW_COUNT = 4;

function PlanCard({
  plan,
  selected,
  onSelect,
}: {
  plan: PlanRow;
  selected: boolean;
  onSelect: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const features = plan.features ?? [];
  const visibleFeatures = expanded ? features : features.slice(0, FEATURE_PREVIEW_COUNT);
  const extraCount = Math.max(0, features.length - FEATURE_PREVIEW_COUNT);

  return (
    <TouchableOpacity
      onPress={onSelect}
      activeOpacity={0.9}
      style={twStyle(
        `rounded-3xl border-2 p-4 ${selected ? "border-primary bg-rose-50" : "border-gray-200 bg-white"}`
      )}
      accessibilityRole="button"
      accessibilityLabel={plan.name}
      accessibilityState={{ selected }}
    >
      {/* Header row: name + badges + selection indicator */}
      <View style={twStyle("flex-row items-start justify-between gap-3")}>
        <View style={twStyle("flex-1 min-w-0")}>
          <View style={twStyle("flex-row flex-wrap items-center gap-2")}>
            <Text style={twStyle("text-lg font-bold text-gray-900")}>{plan.name}</Text>
            {plan.is_popular ? (
              <View
                style={twStyle("flex-row items-center gap-1 rounded-full bg-amber-400 px-2 py-0.5")}
              >
                <Ionicons name="star" size={10} color="#fff" />
                <Text style={twStyle("text-[10px] font-bold text-white")}>Popular</Text>
              </View>
            ) : null}
            {plan.is_free ? (
              <View style={twStyle("rounded-full bg-emerald-100 px-2 py-0.5")}>
                <Text
                  style={twStyle("text-[10px] font-bold uppercase tracking-wider text-emerald-700")}
                >
                  Free
                </Text>
              </View>
            ) : null}
          </View>
          <View style={twStyle("mt-1.5 flex-row items-baseline gap-1")}>
            <Text style={twStyle("text-2xl font-extrabold text-primary")}>{plan.price}</Text>
            {plan.period ? (
              <Text style={twStyle("text-sm font-medium text-gray-500")}>{plan.period}</Text>
            ) : null}
          </View>
          {plan.description ? (
            <Text style={twStyle("mt-1.5 text-sm leading-5 text-gray-600")} numberOfLines={3}>
              {stripHtmlToPlainText(plan.description)}
            </Text>
          ) : null}
        </View>
        <View
          style={twStyle(
            `h-9 w-9 items-center justify-center rounded-full border-2 ${
              selected ? "border-primary bg-primary" : "border-gray-300 bg-white"
            }`
          )}
        >
          {selected ? <Ionicons name="checkmark" size={18} color="#fff" /> : null}
        </View>
      </View>

      {/* Features list */}
      {features.length > 0 ? (
        <View style={twStyle("mt-3 gap-2 border-t border-gray-100 pt-3")}>
          {visibleFeatures.map((f, i) => (
            <View key={`${plan.id}-feat-${i}`} style={twStyle("flex-row items-start gap-2")}>
              <View style={twStyle("mt-0.5")}>
                <Ionicons
                  name="checkmark-circle"
                  size={15}
                  color={selected ? Colors.primary : "#16a34a"}
                />
              </View>
              <Text style={twStyle("flex-1 text-[13px] leading-[19px] text-gray-700")}>
                {stripHtmlToPlainText(f)}
              </Text>
            </View>
          ))}
          {extraCount > 0 ? (
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                Haptics.selectionAsync();
                setExpanded((v) => !v);
              }}
              accessibilityRole="button"
              accessibilityLabel={
                expanded ? "Show fewer features" : `Show ${extraCount} more features`
              }
              style={twStyle("mt-2 flex-row items-center gap-1.5 self-start py-1.5")}
            >
              <Text style={twStyle("text-[13px] font-semibold text-slate-900")}>
                {expanded
                  ? "Show less"
                  : `+ ${extraCount} more feature${extraCount === 1 ? "" : "s"}`}
              </Text>
              <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={14} color="#0f172a" />
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {/* Footer hint reinforcing the free/paid path so users know what's next */}
      <View
        style={twStyle(
          `mt-4 flex-row items-center gap-2 rounded-[1rem] px-4 py-3 ${
            plan.is_free ? "bg-emerald-50" : "bg-slate-100"
          }`
        )}
      >
        <Ionicons
          name={plan.is_free ? "rocket-outline" : "card-outline"}
          size={16}
          color={plan.is_free ? "#047857" : "#0f172a"}
        />
        <Text
          style={twStyle(
            `flex-1 text-[13px] font-semibold ${plan.is_free ? "text-emerald-800" : "text-slate-800"}`
          )}
        >
          {plan.is_free
            ? "Activates instantly — no payment needed"
            : "Secure card payment after submitting"}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function Step14Plan() {
  const { formData, updateFormData } = useOnboardingWizard();
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const initialPlanId = useRef(formData.selected_plan_id);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await api.get<PlanRow[] | { plans?: PlanRow[] }>("/api/public/pricing/plans");
        if (!active) return;
        const raw = res.data as PlanRow[] | { plans?: PlanRow[] } | null | undefined;
        const unsorted = Array.isArray(raw)
          ? raw
          : raw && typeof raw === "object" && Array.isArray((raw as { plans?: PlanRow[] }).plans)
            ? (raw as { plans: PlanRow[] }).plans
            : [];
        // §provider-onboarding-plan-order 2026-05: providers asked us to
        // surface the Free plan first so anyone who just wants to ship can
        // confirm-and-go without a card. We pin free plans to the top and
        // otherwise preserve the backend's curated ordering.
        const list = [...unsorted].sort((a, b) => {
          const aFree = a.is_free ? 1 : 0;
          const bFree = b.is_free ? 1 : 0;
          if (aFree !== bFree) return bFree - aFree;
          return 0;
        });
        setPlans(list);

        if (list.length === 0) {
          updateFormData({
            no_plans_available: true,
            selected_plan_id: undefined,
            selected_plan_name: undefined,
          });
        } else if (!initialPlanId.current?.trim()) {
          // Default selection: prefer the first Free plan so providers can
          // launch immediately. Fall back to the popular plan, then the first
          // returned plan.
          const free = list.find((p) => p.is_free);
          const popular = list.find((p) => p.is_popular);
          const chosen = free ?? popular ?? list[0];
          updateFormData({
            selected_plan_id: chosen.id,
            selected_plan_name: chosen.name,
            no_plans_available: false,
          });
        } else {
          updateFormData({ no_plans_available: false });
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [updateFormData]);

  if (loading) {
    return (
      <View style={twStyle("py-12 items-center gap-3")}>
        <ActivityIndicator color="#0f172a" size="large" />
        <Text style={twStyle("text-[15px] font-medium text-slate-500")}>Loading plans…</Text>
      </View>
    );
  }

  if (plans.length === 0) {
    return (
      <View style={twStyle("py-12 items-center gap-4")}>
        <View style={twStyle("h-16 w-16 items-center justify-center rounded-full bg-slate-100")}>
          <Ionicons name="pricetags-outline" size={32} color="#94a3b8" />
        </View>
        <Text
          style={twStyle("text-center text-[15px] leading-relaxed text-slate-500 max-w-[280px]")}
        >
          No subscription plans available right now. Hit Submit to continue — we&apos;ll sort this
          after.
        </Text>
      </View>
    );
  }

  return (
    <View style={twStyle("gap-4")}>
      <View
        style={twStyle(
          "rounded-[1.5rem] border border-indigo-200 bg-indigo-50 px-5 py-4 shadow-sm"
        )}
      >
        <Text style={twStyle("text-[15px] leading-relaxed text-indigo-900")}>
          Pick the plan that fits today. Free activates instantly — paid plans take you to a secure
          card payment after you submit. You can upgrade or downgrade any time from settings.
        </Text>
      </View>
      {plans.map((p) => (
        <PlanCard
          key={p.id}
          plan={p}
          selected={formData.selected_plan_id === p.id}
          onSelect={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            updateFormData({ selected_plan_id: p.id, selected_plan_name: p.name });
          }}
        />
      ))}
    </View>
  );
}

// ─── Step body dispatcher ────────────────────────────────────────────────────

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
