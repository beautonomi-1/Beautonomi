import { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ActionButton } from "@/components/ui/ActionButton";
import { Colors } from "@/constants/colors";

export default function SettingsChangePasswordScreen() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const { execute: putPassword, loading: saving } = useApiMutation("put");

  const handleSave = useCallback(async () => {
    const cur = currentPassword.trim();
    const newP = newPassword.trim();
    const conf = confirmPassword.trim();
    if (!cur) {
      Alert.alert("Validation", "Current password is required.");
      return;
    }
    if (!newP) {
      Alert.alert("Validation", "New password is required.");
      return;
    }
    if (newP.length < 8) {
      Alert.alert("Validation", "New password must be at least 8 characters long.");
      return;
    }
    if (newP !== conf) {
      Alert.alert("Validation", "New password and confirmation do not match.");
      return;
    }

    const res = await putPassword("/api/me/password", {
      currentPassword: cur,
      newPassword: newP,
    }) as { error?: string };
    if (res.error) {
      Alert.alert("Error", res.error);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Success", "Password updated successfully.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    }
  }, [currentPassword, newPassword, confirmPassword, putPassword, router]);

  return (
    <ScreenContainer>
      <ScreenHeader
        title="Change password"
        subtitle="Update your account password"
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
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 100 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={{ paddingHorizontal: 8, paddingTop: 8 }}>
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
            </View>
            <View style={{ marginBottom: 12 }}>
              <Text style={{ marginBottom: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>New password</Text>
              <TextInput
                style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
                placeholder="At least 8 characters"
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
                label={saving ? "Updating..." : "Update password"}
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
