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
import { CountryOfIssuePicker } from "@/components/CountryOfIssuePicker";
import type { LegalDetails, LegalDetailsErrors } from "@/lib/identity-verification/useIdentityVerification";
import { useTranslation } from "@beautonomi/i18n";

export interface LegalDetailsConfirmFormProps {
  values: LegalDetails;
  errors: LegalDetailsErrors;
  onChange: (v: LegalDetails) => void;
  onSubmit: () => void;
  onCancel: () => void;
  tenantRegionCode?: string | null;
  tenantRegionName?: string | null;
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
  countryLabel,
}: LegalDetailsConfirmFormProps) {
  const { t } = useTranslation();
  const lf = (key: string) => t(`customer.mobile.screens.identityVerification.legalForm.${key}`) as string;
  const lastNameRef = useRef<TextInput>(null);
  const [showDobPicker, setShowDobPicker] = useState(false);
  const dobDate = useMemo(() => defaultDobDate(values.dateOfBirth), [values.dateOfBirth]);

  const borderFor = (field: keyof LegalDetailsErrors) =>
    errors[field] ? "#ef4444" : "#e2e8f0";

  return (
    <View style={{ marginBottom: 24, borderRadius: 16, borderWidth: 1, borderColor: "#E5E7EB", backgroundColor: "#fff", padding: 16 }}>
      <Text style={{ fontSize: 16, fontWeight: "700", color: "#111827", marginBottom: 4 }}>
        {lf("confirmTitle")}
      </Text>
      <Text style={{ fontSize: 14, color: "#4B5563", marginBottom: 16, lineHeight: 20 }}>
        {lf("confirmBody")}
      </Text>

      <Text style={{ fontSize: 14, fontWeight: "500", color: "#374151", marginBottom: 4 }}>
        {lf("firstNameLabel")} <Text style={{ color: "#ef4444" }}>*</Text>
      </Text>
      <TextInput
        style={{ borderRadius: 12, borderWidth: 1, borderColor: borderFor("firstName"), paddingHorizontal: 16, paddingVertical: 12, marginBottom: 4, fontSize: 16, color: "#111827" }}
        value={values.firstName ?? ""}
        onChangeText={(v) => onChange({ ...values, firstName: v })}
        placeholder={lf("firstNamePlaceholder")}
        placeholderTextColor="#9ca3af"
        autoCapitalize="words"
        autoCorrect={false}
        returnKeyType="next"
        onSubmitEditing={() => lastNameRef.current?.focus()}
        accessibilityLabel={lf("firstNameLabel")}
      />
      {errors.firstName && <Text style={{ fontSize: 12, color: "#dc2626", marginBottom: 8 }}>{errors.firstName}</Text>}

      <Text style={{ fontSize: 14, fontWeight: "500", color: "#374151", marginBottom: 4, marginTop: 8 }}>
        {lf("lastNameLabel")} <Text style={{ color: "#ef4444" }}>*</Text>
      </Text>
      <TextInput
        ref={lastNameRef}
        style={{ borderRadius: 12, borderWidth: 1, borderColor: borderFor("lastName"), paddingHorizontal: 16, paddingVertical: 12, marginBottom: 4, fontSize: 16, color: "#111827" }}
        value={values.lastName ?? ""}
        onChangeText={(v) => onChange({ ...values, lastName: v })}
        placeholder={lf("lastNamePlaceholder")}
        placeholderTextColor="#9ca3af"
        autoCapitalize="words"
        autoCorrect={false}
        accessibilityLabel={lf("lastNameLabel")}
      />
      {errors.lastName && <Text style={{ fontSize: 12, color: "#dc2626", marginBottom: 8 }}>{errors.lastName}</Text>}

      <Text style={{ fontSize: 14, fontWeight: "500", color: "#374151", marginBottom: 4, marginTop: 8 }}>
        {lf("dobLabel")} <Text style={{ color: "#ef4444" }}>*</Text>
      </Text>
      <TouchableOpacity
        onPress={() => setShowDobPicker(true)}
        style={{ borderRadius: 12, borderWidth: 1, borderColor: borderFor("dateOfBirth"), paddingHorizontal: 16, paddingVertical: 12, marginBottom: 4 }}
        accessibilityRole="button"
        accessibilityLabel={lf("dobPlaceholder")}
      >
        <Text style={{ fontSize: 16, color: values.dateOfBirth ? "#111827" : "#9ca3af" }}>
          {values.dateOfBirth ? formatLegalDobDisplay(values.dateOfBirth) : lf("dobPlaceholder")}
        </Text>
      </TouchableOpacity>
      {errors.dateOfBirth && <Text style={{ fontSize: 12, color: "#dc2626", marginBottom: 8 }}>{errors.dateOfBirth}</Text>}

      {Platform.OS === "ios" ? (
        <Modal visible={showDobPicker} transparent animationType="slide" onRequestClose={() => setShowDobPicker(false)}>
          <Pressable style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" }} onPress={() => setShowDobPicker(false)}>
            <Pressable style={{ backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24 }} onPress={(e) => e.stopPropagation()}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: "#F3F4F6" }}>
                <Text style={{ fontSize: 16, fontWeight: "600", color: "#111827" }}>{lf("dobPickerTitle")}</Text>
                <TouchableOpacity onPress={() => setShowDobPicker(false)} accessibilityRole="button">
                  <Text style={{ fontSize: 16, fontWeight: "600", color: "#FF0077" }}>{t("common.done")}</Text>
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
            onChange({
              ...values,
              dateOfBirth: composeLegalDobIso({
                day: date.getDate(),
                month: date.getMonth() + 1,
                year: date.getFullYear(),
              }),
            });
          }}
        />
      ) : null}

      <CountryOfIssuePicker
        value={values.country ?? ""}
        onChange={(country) => onChange({ ...values, country })}
        label={countryLabel ?? lf("countryLabelDefault")}
        tenantRegionCode={tenantRegionCode}
        tenantRegionName={tenantRegionName}
      />
      {errors.country && <Text style={{ fontSize: 12, color: "#dc2626", marginTop: -8, marginBottom: 8 }}>{errors.country}</Text>}

      <TouchableOpacity
        onPress={onSubmit}
        style={{ backgroundColor: "#FF0077", borderRadius: 999, paddingVertical: 16, alignItems: "center", marginTop: 8 }}
        accessibilityRole="button"
        accessibilityLabel={lf("startVerification")}
      >
        <Text style={{ color: "#fff", fontWeight: "600", fontSize: 16 }}>{lf("startVerification")}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onCancel} style={{ marginTop: 12, alignItems: "center", paddingVertical: 8 }} accessibilityRole="button">
        <Text style={{ fontSize: 14, color: "#6B7280" }}>{t("common.cancel")}</Text>
      </TouchableOpacity>
    </View>
  );
}
