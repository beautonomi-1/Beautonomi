import { useEffect, useState, useCallback } from "react";
import { View, Text, TextInput, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Platform } from "react-native";
import { AppKeyboardAvoidingView as KeyboardAvoidingView } from "@/components/AppKeyboardAvoidingView";
import { useRouter } from "expo-router";
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
      Alert.alert("Validation", "Current password is required.");
      return;
    }
    if (isSettingFirstPassword && !nonce) {
      Alert.alert("Validation", "Enter the verification code before setting a password.");
      return;
    }
    if (!newP) {
      Alert.alert("Validation", "New password is required.");
      return;
    }
    if (newP.length < minimumPasswordLength) {
      Alert.alert("Validation", `New password must be at least ${minimumPasswordLength} characters long.`);
      return;
    }
    if (newP !== conf) {
      Alert.alert("Validation", "New password and confirmation do not match.");
      return;
    }

    const res = await putPassword("/api/me/password", {
      mode: isSettingFirstPassword ? "set" : "change",
      currentPassword: isSettingFirstPassword ? undefined : cur,
      nonce: isSettingFirstPassword ? nonce : undefined,
      newPassword: newP,
    }) as { error?: string };
    if (res.error) {
      Alert.alert("Error", res.error);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Success", isSettingFirstPassword ? "Password set successfully." : "Password updated successfully.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    }
  }, [currentPassword, newPassword, confirmPassword, passwordNonce, isSettingFirstPassword, minimumPasswordLength, putPassword, router]);

  const requestPasswordNonce = useCallback(async () => {
    if (!canVerifyPasswordAction) {
      Alert.alert("Add contact method", "Add and verify an email or phone number before setting a password.");
      return;
    }
    setRequestingNonce(true);
    try {
      const { error } = await supabase.auth.reauthenticate();
      if (error) throw error;
      Alert.alert("Code sent", "Enter the verification code below to set your password.");
    } catch (e) {
      Alert.alert("Error", getApiErrorMessage(e, "Failed to send verification code."));
    } finally {
      setRequestingNonce(false);
    }
  }, [canVerifyPasswordAction]);

  return (
    <ScreenContainer keyboardAvoiding={false}>
      <ScreenHeader
        title={isSettingFirstPassword ? "Set password" : "Change password"}
        subtitle={isSettingFirstPassword ? "Add password sign-in to this account" : "Update your account password"}
        onBack={() => router.back()}
        rightAction={
          <TouchableOpacity
            onPress={handleSave}
            disabled={saving}
            style={{ minHeight: 40, flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 9999, backgroundColor: "#4f46e6", paddingHorizontal: 16 }}
            accessibilityLabel="Save new password"
            accessibilityRole="button"
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={{ fontWeight: "500", color: Colors.white }}>Save</Text>
            )}
          </TouchableOpacity>
        }
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "padding"}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === "ios" ? 56 : 20}
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
                  Your account uses one-time codes or social login. Send a verification code, then choose a password.
                </Text>
                {!canVerifyPasswordAction ? (
                  <Text style={{ marginTop: 8, fontSize: 13, color: "#b91c1c" }}>
                    Add and verify an email or phone number before setting a password.
                  </Text>
                ) : null}
                <TouchableOpacity
                  onPress={requestPasswordNonce}
                  disabled={requestingNonce || !canVerifyPasswordAction}
                  style={{ marginTop: 12, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white }}
                  accessibilityRole="button"
                  accessibilityLabel="Send password verification code"
                >
                  <Text style={{ fontWeight: "600", color: Colors.gray[900] }}>
                    {requestingNonce ? "Sending..." : "Send verification code"}
                  </Text>
                </TouchableOpacity>
                <Text style={{ marginTop: 12, marginBottom: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Verification code</Text>
                <TextInput
                  style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
                  placeholder="Enter code"
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
                <Text style={{ marginBottom: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Current password</Text>
                <TextInput
                  style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
                  placeholder="Enter current password"
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
                  accessibilityLabel="Forgot password"
                >
                  <Text style={{ color: "#4f46e5", fontWeight: "600" }}>Forgot password?</Text>
                </TouchableOpacity>
              </View>
            )}
            <View style={{ marginBottom: 12 }}>
              <Text style={{ marginBottom: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>New password</Text>
              <TextInput
                style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
                placeholder={`At least ${minimumPasswordLength} characters`}
                placeholderTextColor="#9ca3af"
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <View style={{ marginBottom: 12 }}>
              <Text style={{ marginBottom: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>Confirm new password</Text>
              <TextInput
                style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
                placeholder="Confirm new password"
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
                label={saving ? (isSettingFirstPassword ? "Setting..." : "Updating...") : (isSettingFirstPassword ? "Set password" : "Update password")}
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
