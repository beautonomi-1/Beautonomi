import { useEffect, useState, useCallback } from "react";
import { View, Text, TextInput, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Platform } from "react-native";
import { AppKeyboardAvoidingView as KeyboardAvoidingView } from "@/components/AppKeyboardAvoidingView";
import { useRouter } from "expo-router";
import { useTranslation } from "@beautonomi/i18n";
import * as Haptics from "expo-haptics";
import { useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ActionButton } from "@/components/ui/ActionButton";
import { Colors } from "@/constants/colors";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import { supabase } from "@/lib/supabase/client";

type AuthSecurityState = {
  has_password: boolean;
  has_mailable_email: boolean;
  has_phone: boolean;
  email_is_placeholder: boolean;
  password_changed_at: string | null;
  policy: { minimum_password_length: number };
};

export default function SettingsChangePasswordScreen() {
  const { t } = useTranslation();
  const cp = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.screens.settingsChangePassword.${key}`, opts) as string,
    [t],
  );
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordNonce, setPasswordNonce] = useState("");
  const [authSecurity, setAuthSecurity] = useState<AuthSecurityState | null>(null);
  const [requestingNonce, setRequestingNonce] = useState(false);

  const { execute: putPassword, loading: saving } = useApiMutation("put");
  const isSettingFirstPassword = authSecurity?.has_password === false;
  const minimumPasswordLength = authSecurity?.policy?.minimum_password_length ?? 8;
  const canVerifyPasswordAction = Boolean(
    authSecurity == null ||
      authSecurity.has_password ||
      authSecurity.has_mailable_email ||
      authSecurity.has_phone,
  );

  useEffect(() => {
    let alive = true;
    api.get<{ auth_security?: AuthSecurityState | null }>("/api/me/profile")
      .then((res) => {
        if (!alive || res.error) return;
        setAuthSecurity((res.data as { auth_security?: AuthSecurityState | null } | undefined)?.auth_security ?? null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const handleSave = useCallback(async () => {
    const cur = currentPassword.trim();
    const newP = newPassword.trim();
    const conf = confirmPassword.trim();
    const nonce = passwordNonce.trim();
    if (!isSettingFirstPassword && !cur) {
      Alert.alert(cp("validationTitle"), cp("currentRequired"));
      return;
    }
    if (isSettingFirstPassword && !nonce) {
      Alert.alert(cp("validationTitle"), cp("nonceRequired"));
      return;
    }
    if (!newP) {
      Alert.alert(cp("validationTitle"), cp("newRequired"));
      return;
    }
    if (newP.length < minimumPasswordLength) {
      Alert.alert(cp("validationTitle"), cp("minLength", { count: minimumPasswordLength }));
      return;
    }
    if (newP !== conf) {
      Alert.alert(cp("validationTitle"), cp("mismatch"));
      return;
    }

    const res = await putPassword("/api/me/password", {
      mode: isSettingFirstPassword ? "set" : "change",
      currentPassword: isSettingFirstPassword ? undefined : cur,
      nonce: isSettingFirstPassword ? nonce : undefined,
      newPassword: newP,
    }) as { error?: string };
    if (res.error) {
      Alert.alert(cp("errorTitle"), res.error);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(cp("successTitle"), isSettingFirstPassword ? cp("passwordSet") : cp("passwordUpdated"), [
        { text: cp("ok"), onPress: () => router.back() },
      ]);
    }
  }, [currentPassword, newPassword, confirmPassword, passwordNonce, isSettingFirstPassword, minimumPasswordLength, putPassword, router, cp]);

  const requestPasswordNonce = useCallback(async () => {
    if (!canVerifyPasswordAction) {
      Alert.alert(cp("addContactTitle"), cp("addContactBody"));
      return;
    }
    setRequestingNonce(true);
    try {
      const { error } = await supabase.auth.reauthenticate();
      if (error) throw error;
      Alert.alert(cp("codeSentTitle"), cp("codeSentBody"));
    } catch (e) {
      Alert.alert(cp("errorTitle"), getApiErrorMessage(e, cp("sendFailed")));
    } finally {
      setRequestingNonce(false);
    }
  }, [canVerifyPasswordAction, cp]);

  return (
    <ScreenContainer keyboardAvoiding={false}>
      <ScreenHeader
        title={isSettingFirstPassword ? cp("titleSet") : cp("titleChange")}
        subtitle={isSettingFirstPassword ? cp("subtitleSet") : cp("subtitleChange")}
        onBack={() => router.back()}
        rightAction={
          <TouchableOpacity
            onPress={handleSave}
            disabled={saving}
            style={{ minHeight: 40, flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 9999, backgroundColor: "#4f46e6", paddingHorizontal: 16 }}
            accessibilityLabel={cp("saveA11y")}
            accessibilityRole="button"
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={{ fontWeight: "500", color: Colors.white }}>{cp("save")}</Text>
            )}
          </TouchableOpacity>
        }
      />

      <KeyboardAvoidingView
        behavior="padding"
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === "ios" ? 56 : 0}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 220 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <View style={{ paddingHorizontal: 8, paddingTop: 8 }}>
            {isSettingFirstPassword ? (
              <View style={{ marginBottom: 12, borderRadius: 12, backgroundColor: "#EEF2FF", padding: 12 }}>
                <Text style={{ fontSize: 14, color: Colors.gray[700], lineHeight: 20 }}>
                  {cp("firstPasswordHint")}
                </Text>
                {!canVerifyPasswordAction ? (
                  <Text style={{ marginTop: 8, fontSize: 13, color: "#b91c1c" }}>
                    {cp("addContactInline")}
                  </Text>
                ) : null}
                <TouchableOpacity
                  onPress={requestPasswordNonce}
                  disabled={requestingNonce || !canVerifyPasswordAction}
                  style={{ marginTop: 12, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white }}
                  accessibilityRole="button"
                  accessibilityLabel={cp("sendCodeA11y")}
                >
                  <Text style={{ fontWeight: "600", color: Colors.gray[900] }}>
                    {requestingNonce ? cp("sending") : cp("sendCode")}
                  </Text>
                </TouchableOpacity>
                <Text style={{ marginTop: 12, marginBottom: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>{cp("verificationCode")}</Text>
                <TextInput
                  style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
                  placeholder={cp("codePlaceholder")}
                  placeholderTextColor="#9ca3af"
                  value={passwordNonce}
                  onChangeText={(value) => setPasswordNonce(value.replace(/\D/g, ""))}
                  keyboardType="number-pad"
                  autoComplete="sms-otp"
                  textContentType="oneTimeCode"
                />
              </View>
            ) : (
              <View style={{ marginBottom: 12 }}>
                <Text style={{ marginBottom: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>{cp("currentPassword")}</Text>
                <TextInput
                  style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
                  placeholder={cp("currentPlaceholder")}
                  placeholderTextColor="#9ca3af"
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  onPress={() => router.push("/(auth)/forgot-password" as never)}
                  style={{ marginTop: 8 }}
                  accessibilityRole="link"
                  accessibilityLabel={cp("forgotA11y")}
                >
                  <Text style={{ color: "#4f46e5", fontWeight: "600" }}>{cp("forgot")}</Text>
                </TouchableOpacity>
              </View>
            )}
            <View style={{ marginBottom: 12 }}>
              <Text style={{ marginBottom: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>{cp("newPassword")}</Text>
              <TextInput
                style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
                placeholder={cp("minLengthPlaceholder", { count: minimumPasswordLength })}
                placeholderTextColor="#9ca3af"
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <View style={{ marginBottom: 12 }}>
              <Text style={{ marginBottom: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>{cp("confirmPassword")}</Text>
              <TextInput
                style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
                placeholder={cp("confirmPlaceholder")}
                placeholderTextColor="#9ca3af"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <View style={{ marginTop: 16 }}>
              <ActionButton
                label={saving ? (isSettingFirstPassword ? cp("setting") : cp("updating")) : (isSettingFirstPassword ? cp("setPassword") : cp("updatePassword"))}
                onPress={handleSave}
                fullWidth
                disabled={saving}
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
