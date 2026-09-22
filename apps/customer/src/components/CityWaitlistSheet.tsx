import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { api } from "@/lib/api-client";
import { useTranslation } from "@beautonomi/i18n";

type Props = {
  visible: boolean;
  onClose: () => void;
  countryCode: string;
  defaultCity?: string;
};

function normalizeCountryCode(value: string): string | undefined {
  const code = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : undefined;
}

export function CityWaitlistSheet({
  visible,
  onClose,
  countryCode,
  defaultCity = "",
}: Props) {
  const { t } = useTranslation();
  const cw = (key: string) => t(`web.global.cityWaitlist.${key}`) as string;

  const [city, setCity] = useState(defaultCity);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setCity(defaultCity);
    setName("");
    setEmail("");
    setPhone("");
    setError(null);
    setSubmitting(false);
  }, [visible, defaultCity]);

  const submit = async () => {
    setError(null);
    if (!city.trim()) {
      setError(cw("enterCity"));
      return;
    }
    if (!name.trim()) {
      setError(cw("enterName"));
      return;
    }
    const emailTrim = email.trim();
    const phoneTrim = phone.trim();
    if (!emailTrim && phoneTrim.length < 7) {
      setError(cw("contactRequired"));
      return;
    }
    if (phoneTrim.length > 0 && phoneTrim.length < 7) {
      setError(cw("invalidPhone"));
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post("/api/public/city-waitlist", {
        city_name: city.trim(),
        name: name.trim(),
        email: emailTrim || undefined,
        phone: phoneTrim || undefined,
        country_code: normalizeCountryCode(countryCode),
        source: "customer_app",
        persona: "customer",
      });
      if (res.error) {
        setError(typeof res.error === "string" ? res.error : cw("joinFailed"));
        return;
      }
      onClose();
    } catch {
      setError(cw("joinFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: "#fff", borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20 }}>
          <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 8 }}>{cw("title")}</Text>
          <Text style={{ color: "#6b7280", marginBottom: 12, lineHeight: 20 }}>{cw("description")}</Text>
          {error ? <Text style={{ color: "#b45309", marginBottom: 8 }}>{error}</Text> : null}
          <TextInput
            placeholder={cw("cityPlaceholder")}
            value={city}
            onChangeText={setCity}
            style={{ borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 12, marginBottom: 8 }}
          />
          <TextInput
            placeholder={cw("fullNamePlaceholder")}
            value={name}
            onChangeText={setName}
            style={{ borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 12, marginBottom: 8 }}
          />
          <TextInput
            placeholder={cw("emailPlaceholder")}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            style={{ borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 12, marginBottom: 8 }}
          />
          <TextInput
            placeholder={cw("phonePlaceholder")}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            style={{ borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 12, marginBottom: 12 }}
          />
          <Pressable
            onPress={() => void submit()}
            disabled={submitting}
            style={{ backgroundColor: "#111827", padding: 14, borderRadius: 10, alignItems: "center", marginBottom: 8 }}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: "#fff", fontWeight: "700" }}>{cw("joinWaitlist")}</Text>
            )}
          </Pressable>
          <Pressable onPress={onClose} style={{ padding: 12, alignItems: "center" }}>
            <Text style={{ color: "#6b7280" }}>{cw("cancel")}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
