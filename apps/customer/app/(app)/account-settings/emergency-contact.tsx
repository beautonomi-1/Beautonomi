import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import { AppKeyboardAvoidingView as KeyboardAvoidingView } from "@/components/AppKeyboardAvoidingView";
import * as Haptics from "expo-haptics";
import { useTranslation } from "@beautonomi/i18n";
import { useApi } from "@/hooks/useApi";
import { api } from "@/lib/api-client";
import { ScreenFrame } from "@/components/ScreenFrame";
import { TrustScreenShell } from "@/components/safety/TrustScreenShell";
import { E164PhoneField } from "@/components/E164PhoneField";
import { Colors } from "@/constants/colors";
import { SCREEN_PADDING, RADIUS_INPUT, RADIUS_BUTTON } from "@/constants/layout";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { useSafetyStackBack } from "@/lib/customer-safety-navigation";
import { trackEmergencyContactSaved } from "@/lib/analytics";
import { getDeviceDefaultCountryDial } from "@/lib/device-default-country-dial";
import {
  splitPhoneForNationalInput,
  validateE164Phone,
  composeE164FromNational,
} from "@/lib/phone-country-codes";

type EmergencyContact = {
  name?: string | null;
  relationship?: string | null;
  phone?: string | null;
  email?: string | null;
  country_code?: string | null;
};

type MeProfile = {
  emergency_contact?: EmergencyContact | null;
};

function profileToForm(profile: MeProfile | null | undefined) {
  const ec = profile?.emergency_contact;
  const phone = ec?.phone?.trim() ?? "";
  const dial = ec?.country_code ?? getDeviceDefaultCountryDial();
  const split = splitPhoneForNationalInput(
    phone.startsWith("+") ? phone : phone ? `${dial}${phone}` : "",
    dial,
  );
  const e164 = phone.startsWith("+")
    ? phone
    : phone
      ? composeE164FromNational(split.countryCode, split.nationalDisplay) ?? ""
      : "";
  return {
    name: ec?.name?.trim() ?? "",
    relationship: ec?.relationship?.trim() ?? "",
    email: ec?.email?.trim() ?? "",
    phoneE164: e164,
  };
}

export default function EmergencyContactScreen() {
  useScreenTracking("Emergency contact");
  const { t } = useTranslation();
  const handleBack = useSafetyStackBack();
  const ec = useCallback(
    (key: string) =>
      t(`customer.mobile.screens.emergencyContact.${key}`, {
        defaultValue: t(`provider.mobile.screens.emergencyContact.${key}`),
      }) as string,
    [t],
  );

  const { data, loading, error, refresh } = useApi<MeProfile>("/api/me/profile");
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [email, setEmail] = useState("");
  const [phoneE164, setPhoneE164] = useState("");
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; phone?: string }>({});
  const initialRef = useRef<string>("");
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (!data) return;
    const form = profileToForm(data);
    setName(form.name);
    setRelationship(form.relationship);
    setEmail(form.email);
    setPhoneE164(form.phoneE164);
    initialRef.current = JSON.stringify(form);
    dirtyRef.current = false;
  }, [data]);

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
  }, []);

  const tryBack = useCallback(() => {
    const current = JSON.stringify({ name, relationship, email, phoneE164 });
    if (dirtyRef.current && current !== initialRef.current) {
      Alert.alert(ec("unsavedTitle"), ec("unsavedBody"), [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("common.discard", { defaultValue: "Discard" }), style: "destructive", onPress: handleBack },
      ]);
      return;
    }
    handleBack();
  }, [name, relationship, email, phoneE164, ec, t, handleBack]);

  const validate = useCallback((): boolean => {
    const errors: { name?: string; phone?: string } = {};
    if (!name.trim()) errors.name = ec("validationName");
    const phoneErr = validateE164Phone(phoneE164);
    if (!phoneE164.trim() || phoneErr) errors.phone = ec("validationPhone");
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }, [name, phoneE164, ec]);

  const save = useCallback(async () => {
    if (!validate()) return;
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const split = splitPhoneForNationalInput(phoneE164, getDeviceDefaultCountryDial());
      const res = await api.patch("/api/me/profile", {
        emergency_contact: {
          name: name.trim(),
          relationship: relationship.trim() || null,
          phone: phoneE164.trim(),
          country_code: split.countryCode,
          email: email.trim() || null,
        },
      });
      if (res.error) {
        Alert.alert(t("customer.mobile.screens.authLogin.errorTitle"), ec("saveFailed"));
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      trackEmergencyContactSaved();
      initialRef.current = JSON.stringify({ name, relationship, email, phoneE164 });
      dirtyRef.current = false;
      Alert.alert(ec("savedTitle"), ec("savedBody"), [
        { text: t("common.ok"), onPress: handleBack },
      ]);
    } catch {
      Alert.alert(t("customer.mobile.screens.authLogin.errorTitle"), ec("saveFailed"));
    } finally {
      setSaving(false);
    }
  }, [validate, name, relationship, email, phoneE164, ec, t, handleBack]);

  const inputStyle = {
    borderRadius: RADIUS_INPUT,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    backgroundColor: Colors.white,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: Colors.gray[900],
  };

  return (
    <ScreenFrame loading={loading && !data} error={error && !data ? ec("loadFailed") : null} onRetry={refresh}>
      <TrustScreenShell
        title={ec("title")}
        subtitle={ec("subtitle")}
        breadcrumbSegment={ec("title")}
        onBack={tryBack}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, marginHorizontal: -SCREEN_PADDING, paddingHorizontal: SCREEN_PADDING }}
        keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
      >
        <View style={{ gap: 16, paddingBottom: 32 }}>
          <View
            style={{
              backgroundColor: Colors.gray[50],
              borderRadius: 12,
              padding: 16,
              borderWidth: 1,
              borderColor: Colors.gray[100],
            }}
          >
            <Text style={{ fontWeight: "600", color: Colors.gray[900], marginBottom: 4 }}>{ec("privacyTitle")}</Text>
            <Text style={{ fontSize: 14, color: Colors.gray[600], lineHeight: 20 }}>{ec("privacyBody")}</Text>
          </View>

          <View>
            <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700], marginBottom: 8 }}>
              {ec("nameLabel")}
            </Text>
            <TextInput
              style={inputStyle}
              value={name}
              onChangeText={(v) => {
                setName(v);
                markDirty();
              }}
              placeholder={ec("namePlaceholder")}
              placeholderTextColor={Colors.gray[400]}
              accessibilityLabel={ec("nameLabel")}
            />
            {fieldErrors.name ? (
              <Text style={{ color: "#DC2626", fontSize: 13, marginTop: 6 }}>{fieldErrors.name}</Text>
            ) : null}
          </View>

          <View>
            <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700], marginBottom: 8 }}>
              {ec("relationshipLabel")}
            </Text>
            <TextInput
              style={inputStyle}
              value={relationship}
              onChangeText={(v) => {
                setRelationship(v);
                markDirty();
              }}
              placeholder={ec("relationshipPlaceholder")}
              placeholderTextColor={Colors.gray[400]}
              accessibilityLabel={ec("relationshipLabel")}
            />
          </View>

          <E164PhoneField
            label={ec("phoneLabel")}
            valueE164={phoneE164}
            onChangeE164={(v) => {
              setPhoneE164(v);
              markDirty();
            }}
            accessibilityLabel={ec("phoneLabel")}
          />
          {fieldErrors.phone ? (
            <Text style={{ color: "#DC2626", fontSize: 13, marginTop: -8 }}>{fieldErrors.phone}</Text>
          ) : null}

          <View>
            <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700], marginBottom: 8 }}>
              {ec("emailLabel")}
            </Text>
            <TextInput
              style={inputStyle}
              value={email}
              onChangeText={(v) => {
                setEmail(v);
                markDirty();
              }}
              placeholder={ec("emailPlaceholder")}
              placeholderTextColor={Colors.gray[400]}
              keyboardType="email-address"
              autoCapitalize="none"
              accessibilityLabel={ec("emailLabel")}
            />
          </View>

          <TouchableOpacity
            onPress={() => void save()}
            disabled={saving}
            style={{
              backgroundColor: Colors.primary,
              paddingVertical: 16,
              borderRadius: RADIUS_BUTTON,
              alignItems: "center",
              opacity: saving ? 0.7 : 1,
              marginTop: 8,
            }}
            accessibilityRole="button"
            accessibilityLabel={saving ? ec("saving") : ec("save")}
          >
            {saving ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={{ color: Colors.white, fontWeight: "600", fontSize: 16 }}>{ec("save")}</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </ScreenFrame>
  );
}
