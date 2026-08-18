import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  Pressable,
  FlatList,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useResponsive } from "@/hooks/useResponsive";
import { Colors } from "@/constants/colors";
import {
  COUNTRY_CODES,
  type CountryCodeOption,
  splitPhoneForNationalInput,
  composeE164FromNational,
  validateNationalPhoneDigits,
} from "@/lib/phone-country-codes";
import { getDeviceDefaultCountryDial } from "@/lib/device-default-country-dial";
import { normalizeSupabaseAuthPhone } from "@/lib/supabase-sms-otp";
import { verticalFlatListPerf } from "@/lib/flatListPerformance";

export type E164PhoneFieldProps = {
  valueE164: string;
  onChangeE164: (e164: string) => void;
  label?: string;
  defaultCountryDial?: string;
  placeholderNational?: string;
  compact?: boolean;
  muted?: boolean;
  showHint?: boolean;
  accessibilityLabel?: string;
};

export function E164PhoneField({
  valueE164,
  onChangeE164,
  label,
  defaultCountryDial,
  placeholderNational,
  compact = false,
  muted = false,
  showHint = true,
  accessibilityLabel = "Phone number",
}: E164PhoneFieldProps) {
  const { screenPadding } = useResponsive();
  const lastSyncedExternal = useRef<string | undefined>(undefined);
  const resolvedDefaultDial = defaultCountryDial ?? getDeviceDefaultCountryDial();
  const defaultDialRef = useRef(resolvedDefaultDial);
  const [countryCode, setCountryCode] = useState(() => resolvedDefaultDial);
  const [national, setNational] = useState("");
  const nationalPlaceholder =
    placeholderNational ?? (resolvedDefaultDial === "+27" ? "82 123 4567" : "Mobile number");
  const [showPicker, setShowPicker] = useState(false);
  const [search, setSearch] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);

  useEffect(() => {
    const v = valueE164 ?? "";
    if (lastSyncedExternal.current === v) return;
    lastSyncedExternal.current = v;
    const split = splitPhoneForNationalInput(v, defaultDialRef.current);
    setCountryCode(split.countryCode);
    setNational(split.nationalDisplay);
    setFieldError(null);
  }, [valueE164]);

  const prevResolvedDefaultDial = useRef(resolvedDefaultDial);
  useEffect(() => {
    defaultDialRef.current = resolvedDefaultDial;
    if (prevResolvedDefaultDial.current !== resolvedDefaultDial) {
      prevResolvedDefaultDial.current = resolvedDefaultDial;
      if (!(valueE164 ?? "").trim()) {
        setCountryCode(resolvedDefaultDial);
      }
    }
  }, [resolvedDefaultDial, valueE164]);

  const emit = useCallback(
    (cc: string, nat: string) => {
      const composed = composeE164FromNational(cc, nat);
      const out = composed ? normalizeSupabaseAuthPhone(composed) : "";
      lastSyncedExternal.current = out;
      onChangeE164(out);
    },
    [onChangeE164],
  );

  const onNationalChange = useCallback(
    (text: string) => {
      const digits = text.replace(/[^\d\s]/g, "");
      setNational(digits);
      if (digits.replace(/\s/g, "").length > 0) {
        setFieldError(validateNationalPhoneDigits(digits, countryCode));
      } else {
        setFieldError(null);
      }
      emit(countryCode, digits);
    },
    [countryCode, emit],
  );

  const selectedCountry = COUNTRY_CODES.find((c) => c.code === countryCode);
  const filtered = search
    ? COUNTRY_CODES.filter((c) => c.label.toLowerCase().includes(search.toLowerCase()))
    : COUNTRY_CODES;

  const py = compact ? 10 : 12;
  const pickerPy = compact ? 10 : 12;
  const bg = muted ? "#F9FAFA" : "#FAFAFA";
  const borderCol = fieldError ? "#EF4444" : "#E5E7EB";

  return (
    <View style={label ? { marginBottom: 12 } : undefined}>
      {label ? (
        <Text style={{ marginBottom: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>{label}</Text>
      ) : null}
      <View
        style={{
          flexDirection: "row",
          borderWidth: 1.5,
          borderColor: borderCol,
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <TouchableOpacity
          onPress={() => {
            setShowPicker(true);
            setSearch("");
          }}
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: "#F3F4F6",
            paddingHorizontal: compact ? 10 : 12,
            paddingVertical: py,
            borderRightWidth: 1,
            borderRightColor: "#E5E7EB",
          }}
          accessibilityLabel="Select country code"
          accessibilityRole="button"
        >
          <Text style={{ fontSize: compact ? 16 : 18, marginRight: 4 }}>{selectedCountry?.flag ?? "🌍"}</Text>
          <Text style={{ fontSize: compact ? 14 : 15, fontWeight: "600", color: "#111827", marginRight: 4 }}>
            {countryCode}
          </Text>
          <Ionicons name="chevron-down" size={compact ? 12 : 14} color="#6B7280" />
        </TouchableOpacity>
        <TextInput
          style={{
            flex: 1,
            backgroundColor: bg,
            paddingHorizontal: compact ? 12 : 14,
            paddingVertical: py,
            fontSize: compact ? 15 : 16,
            color: "#111827",
          }}
          value={national}
          onChangeText={onNationalChange}
          placeholder={nationalPlaceholder}
          placeholderTextColor="#9ca3af"
          keyboardType="phone-pad"
          accessibilityLabel={accessibilityLabel}
        />
      </View>
      {showHint ? (
        <Text style={{ marginTop: 4, fontSize: 12, color: Colors.gray[500], lineHeight: 18 }}>
          Enter your national number without repeating the country code. Leading 0 is optional.
        </Text>
      ) : null}
      {fieldError ? <Text style={{ marginTop: 4, fontSize: 12, color: "#EF4444" }}>{fieldError}</Text> : null}

      <Modal visible={showPicker} transparent animationType="slide" onRequestClose={() => setShowPicker(false)}>
        <Pressable
          style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" }}
          onPress={() => setShowPicker(false)}
          accessibilityLabel="Close country picker"
          accessibilityRole="button"
        >
          <Pressable
            style={{ backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "70%" }}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={{ alignItems: "center", paddingTop: 12, paddingBottom: 4 }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: "#D1D5DB" }} />
            </View>
            <View
              style={{
                paddingHorizontal: screenPadding,
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderColor: "#F3F4F6",
              }}
            >
              <Text style={{ textAlign: "center", fontWeight: "700", fontSize: 17, color: "#111827", marginBottom: 12 }}>
                Select country
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: "#F3F4F6",
                  borderRadius: 10,
                  paddingHorizontal: 12,
                }}
              >
                <Ionicons name="search" size={16} color="#9CA3AF" />
                <TextInput
                  style={{ flex: 1, paddingVertical: pickerPy, paddingHorizontal: 8, fontSize: 15, color: "#111827" }}
                  placeholder="Search country..."
                  placeholderTextColor="#9CA3AF"
                  value={search}
                  onChangeText={setSearch}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>
            <FlatList<CountryCodeOption>
              {...verticalFlatListPerf}
              data={filtered}
              keyExtractor={(c: CountryCodeOption) => c.code}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item: c }: { item: CountryCodeOption }) => (
                <TouchableOpacity
                  onPress={() => {
                    setCountryCode(c.code);
                    setShowPicker(false);
                    setFieldError(national.trim() ? validateNationalPhoneDigits(national, c.code) : null);
                    emit(c.code, national);
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 14,
                    paddingHorizontal: screenPadding,
                    borderBottomWidth: 1,
                    borderColor: "#F9FAFB",
                  }}
                  accessibilityLabel={c.label}
                  accessibilityRole="button"
                >
                  <Text style={{ fontSize: 20, marginRight: 12 }}>{c.flag}</Text>
                  <Text
                    style={{
                      flex: 1,
                      fontSize: 15,
                      color: countryCode === c.code ? Colors.primary : "#111827",
                      fontWeight: countryCode === c.code ? "700" : "400",
                    }}
                  >
                    {c.label}
                  </Text>
                  {countryCode === c.code ? (
                    <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />
                  ) : null}
                </TouchableOpacity>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
