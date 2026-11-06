import { forwardRef, useCallback, useState } from "react";
import { View, Text, TextInput, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "@beautonomi/i18n";
import { Colors } from "@/constants/colors";
import type { PublicAuthPolicy } from "@/lib/config-bundle";
import { getPasswordStrength } from "@/lib/auth/password-recovery";

type Props = {
  /** i18n namespace holding the resetPassword strings, e.g. `provider.mobile.screens.resetPassword`. */
  ns: string;
  password: string;
  onPasswordChange: (value: string) => void;
  confirm: string;
  onConfirmChange: (value: string) => void;
  policy: Pick<PublicAuthPolicy, "minimum_password_length" | "password_requirements">;
  disabled?: boolean;
  onSubmitEditing?: () => void;
};

const inputStyle = {
  flex: 1,
  paddingHorizontal: 16,
  paddingVertical: 13,
  fontSize: 16,
  color: Colors.gray[900],
} as const;

const boxStyle = {
  flexDirection: "row" as const,
  alignItems: "center" as const,
  borderRadius: 12,
  borderWidth: 1,
  borderColor: Colors.gray[300],
  backgroundColor: Colors.white,
};

/** New password + confirmation with policy hint, strength meter, and live match feedback. */
export const NewPasswordFields = forwardRef<TextInput, Props>(function NewPasswordFields(
  { ns, password, onPasswordChange, confirm, onConfirmChange, policy, disabled, onSubmitEditing },
  passwordRef,
) {
  const { t } = useTranslation();
  const rp = useCallback((key: string, opts?: Record<string, unknown>) => t(`${ns}.${key}`, opts) as string, [t, ns]);
  const [visible, setVisible] = useState(false);
  const [confirmRef, setConfirmRef] = useState<TextInput | null>(null);
  const strength = getPasswordStrength(password);
  const matches = confirm.length > 0 && confirm === password;

  const policyHint =
    policy.password_requirements === "letters_and_digits"
      ? rp("policyHintLettersDigits")
      : policy.password_requirements === "lowercase_uppercase_number"
        ? rp("policyHintMixed")
        : null;

  return (
    <View>
      <Text style={{ marginBottom: 6, fontSize: 14, fontWeight: "600", color: Colors.gray[700] }}>{rp("newPasswordLabel")}</Text>
      <View style={[boxStyle, disabled ? { opacity: 0.6 } : null]}>
        <TextInput
          ref={passwordRef}
          style={inputStyle}
          value={password}
          onChangeText={onPasswordChange}
          placeholder={rp("newPasswordPlaceholder", { count: policy.minimum_password_length })}
          placeholderTextColor={Colors.gray[400]}
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="newPassword"
          editable={!disabled}
          returnKeyType="next"
          onSubmitEditing={() => confirmRef?.focus()}
          blurOnSubmit={false}
          accessibilityLabel={rp("newPasswordLabel")}
        />
        <TouchableOpacity
          onPress={() => setVisible((v) => !v)}
          style={{ paddingHorizontal: 14, paddingVertical: 12 }}
          accessibilityRole="button"
          accessibilityLabel={visible ? rp("hidePassword") : rp("showPassword")}
          accessibilityState={{ selected: visible }}
          hitSlop={8}
        >
          <Ionicons name={visible ? "eye-off-outline" : "eye-outline"} size={20} color={Colors.gray[500]} />
        </TouchableOpacity>
      </View>
      <Text style={{ marginTop: 6, fontSize: 12, color: Colors.gray[500] }}>
        {rp("minLength", { count: policy.minimum_password_length })}
        {policyHint ? ` · ${policyHint}` : ""}
      </Text>

      {password.length > 0 ? (
        <View style={{ marginTop: 10 }} accessibilityLiveRegion="polite">
          <View style={{ flexDirection: "row" }}>
            {[1, 2, 3, 4, 5].map((i) => (
              <View
                key={i}
                style={{
                  flex: 1,
                  height: 5,
                  borderRadius: 3,
                  backgroundColor: strength.score >= i ? strength.color : Colors.gray[200],
                  marginEnd: i < 5 ? 4 : 0,
                }}
              />
            ))}
          </View>
          <Text style={{ marginTop: 6, fontSize: 12, fontWeight: "600", color: strength.color }}>
            {rp("strength", { label: t(`auth.${strength.labelKey}`) })}
            {strength.score < 4 ? (
              <Text style={{ fontWeight: "400", color: Colors.gray[500] }}>{` — ${rp("strengthTip")}`}</Text>
            ) : null}
          </Text>
        </View>
      ) : null}

      <Text style={{ marginTop: 18, marginBottom: 6, fontSize: 14, fontWeight: "600", color: Colors.gray[700] }}>{rp("confirmLabel")}</Text>
      <View
        style={[
          boxStyle,
          confirm.length > 0 ? { borderColor: matches ? "#22C55E" : "#EF4444" } : null,
          disabled ? { opacity: 0.6 } : null,
        ]}
      >
        <TextInput
          ref={setConfirmRef}
          style={inputStyle}
          value={confirm}
          onChangeText={onConfirmChange}
          placeholder={rp("confirmPlaceholder")}
          placeholderTextColor={Colors.gray[400]}
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="newPassword"
          editable={!disabled}
          returnKeyType="done"
          onSubmitEditing={onSubmitEditing}
          accessibilityLabel={rp("confirmLabel")}
        />
      </View>
      <View style={{ minHeight: 20, marginTop: 6 }} accessibilityLiveRegion="polite">
        {confirm.length > 0 ? (
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Ionicons name={matches ? "checkmark-circle" : "close-circle"} size={14} color={matches ? "#16A34A" : "#DC2626"} />
            <Text style={{ marginStart: 4, fontSize: 12, color: matches ? "#16A34A" : "#DC2626" }}>
              {matches ? rp("passwordsMatch") : rp("mismatch")}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
});
