import { useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Platform,
  Modal,
  Pressable,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  formatLegalDobDisplay,
  parseLegalDobIso,
  composeLegalDobIso,
} from "@beautonomi/utils";
import { twStyle } from "@/lib/twStyle";
import { CountryOfIssuePicker } from "@/components/CountryOfIssuePicker";
import type { LegalDetails, LegalDetailsErrors } from "@/lib/identity-verification/useIdentityVerification";

export interface LegalDetailsConfirmFormProps {
  values: LegalDetails;
  errors: LegalDetailsErrors;
  onChange: (v: LegalDetails) => void;
  onSubmit: () => void;
  onCancel: () => void;
  tenantRegionCode?: string | null;
  tenantRegionName?: string | null;
  isProvider?: boolean;
  countryLabel?: string;
}

function defaultDobDate(iso?: string): Date {
  if (iso) {
    const parsed = new Date(`${iso}T12:00:00`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const d = new Date();
  d.setFullYear(d.getFullYear() - 25);
  d.setMonth(0);
  d.setDate(1);
  return d;
}

function maxDobDate(minAge = 18): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() - minAge);
  return d;
}

export function LegalDetailsConfirmForm({
  values,
  errors,
  onChange,
  onSubmit,
  onCancel,
  tenantRegionCode,
  tenantRegionName,
  isProvider = false,
  countryLabel = "Country on ID",
}: LegalDetailsConfirmFormProps) {
  const lastNameRef = useRef<TextInput>(null);
  const [showDobPicker, setShowDobPicker] = useState(false);
  const dobDate = useMemo(() => defaultDobDate(values.dateOfBirth), [values.dateOfBirth]);

  const borderFor = (field: keyof LegalDetailsErrors) =>
    errors[field] ? "#ef4444" : "#e2e8f0";

  return (
    <View style={twStyle("mt-4 rounded-2xl bg-white border border-gray-200 p-4")}>
      <Text style={twStyle("text-base font-semibold text-gray-900 mb-1")}>Confirm your legal details</Text>
      <Text style={twStyle("text-sm text-gray-600 mb-4 leading-5")}>
        Enter your details exactly as they appear on your government-issued ID or passport. Nicknames or abbreviations will cause a mismatch.
      </Text>

      {isProvider && (
        <View style={twStyle("mb-4 rounded-xl bg-blue-50 p-3")}>
          <Text style={twStyle("text-sm text-blue-700 leading-5")}>
            You&apos;re verifying your own identity as the owner or representative. Business payout accounts can use your salon name — that&apos;s expected.
          </Text>
        </View>
      )}

      <Text style={twStyle("text-sm font-medium text-gray-700 mb-1")}>
        Legal first name <Text style={{ color: "#ef4444" }}>*</Text>
      </Text>
      <TextInput
        style={[twStyle("rounded-xl border px-4 py-3 mb-1 text-base text-gray-900"), { borderColor: borderFor("firstName") }]}
        value={values.firstName ?? ""}
        onChangeText={(v) => onChange({ ...values, firstName: v })}
        placeholder="As on your ID"
        placeholderTextColor="#9ca3af"
        autoCapitalize="words"
        autoCorrect={false}
        returnKeyType="next"
        onSubmitEditing={() => lastNameRef.current?.focus()}
        accessibilityLabel="Legal first name"
      />
      {errors.firstName && <Text style={twStyle("text-xs text-red-600 mb-2")}>{errors.firstName}</Text>}

      <Text style={twStyle("text-sm font-medium text-gray-700 mb-1 mt-2")}>
        Legal last name <Text style={{ color: "#ef4444" }}>*</Text>
      </Text>
      <TextInput
        ref={lastNameRef}
        style={[twStyle("rounded-xl border px-4 py-3 mb-1 text-base text-gray-900"), { borderColor: borderFor("lastName") }]}
        value={values.lastName ?? ""}
        onChangeText={(v) => onChange({ ...values, lastName: v })}
        placeholder="Surname as on your ID"
        placeholderTextColor="#9ca3af"
        autoCapitalize="words"
        autoCorrect={false}
        returnKeyType="done"
        accessibilityLabel="Legal last name"
      />
      {errors.lastName && <Text style={twStyle("text-xs text-red-600 mb-2")}>{errors.lastName}</Text>}

      <Text style={twStyle("text-sm font-medium text-gray-700 mb-1 mt-2")}>
        Date of birth <Text style={{ color: "#ef4444" }}>*</Text>
      </Text>
      <TouchableOpacity
        onPress={() => setShowDobPicker(true)}
        style={[twStyle("rounded-xl border px-4 py-3 mb-1"), { borderColor: borderFor("dateOfBirth") }]}
        accessibilityRole="button"
        accessibilityLabel="Select date of birth"
      >
        <Text style={twStyle(values.dateOfBirth ? "text-base text-gray-900" : "text-base text-gray-400")}>
          {values.dateOfBirth ? formatLegalDobDisplay(values.dateOfBirth) : "Select date of birth"}
        </Text>
      </TouchableOpacity>
      {errors.dateOfBirth && <Text style={twStyle("text-xs text-red-600 mb-2")}>{errors.dateOfBirth}</Text>}

      {Platform.OS === "ios" ? (
        <Modal visible={showDobPicker} transparent animationType="slide" onRequestClose={() => setShowDobPicker(false)}>
          <Pressable style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" }} onPress={() => setShowDobPicker(false)}>
            <Pressable style={{ backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24 }} onPress={(e) => e.stopPropagation()}>
              <View style={twStyle("flex-row items-center justify-between px-4 py-3 border-b border-gray-100")}>
                <Text style={twStyle("text-base font-semibold text-gray-900")}>Date of birth</Text>
                <TouchableOpacity onPress={() => setShowDobPicker(false)} accessibilityRole="button">
                  <Text style={twStyle("text-base font-semibold text-primary")}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={dobDate}
                mode="date"
                display="spinner"
                maximumDate={maxDobDate()}
                onChange={(_, date) => {
                  if (!date) return;
                  const iso = composeLegalDobIso({
                    day: date.getDate(),
                    month: date.getMonth() + 1,
                    year: date.getFullYear(),
                  });
                  onChange({ ...values, dateOfBirth: iso });
                }}
              />
            </Pressable>
          </Pressable>
        </Modal>
      ) : showDobPicker ? (
        <DateTimePicker
          value={dobDate}
          mode="date"
          display="default"
          maximumDate={maxDobDate()}
          onChange={(_, date) => {
            setShowDobPicker(false);
            if (!date) return;
            const iso = composeLegalDobIso({
              day: date.getDate(),
              month: date.getMonth() + 1,
              year: date.getFullYear(),
            });
            onChange({ ...values, dateOfBirth: iso });
          }}
        />
      ) : null}

      <CountryOfIssuePicker
        value={values.country ?? ""}
        onChange={(country) => onChange({ ...values, country })}
        label={countryLabel}
        tenantRegionCode={tenantRegionCode}
        tenantRegionName={tenantRegionName}
      />
      {errors.country && <Text style={twStyle("text-xs text-red-600 -mt-3 mb-2")}>{errors.country}</Text>}

      <TouchableOpacity
        onPress={onSubmit}
        style={twStyle("bg-primary rounded-full py-4 items-center mt-2")}
        accessibilityRole="button"
        accessibilityLabel="Start verification"
      >
        <Text style={twStyle("text-white font-semibold text-base")}>Start verification</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onCancel}
        style={twStyle("mt-3 items-center py-2")}
        accessibilityRole="button"
        accessibilityLabel="Cancel"
      >
        <Text style={twStyle("text-sm text-gray-500")}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}
