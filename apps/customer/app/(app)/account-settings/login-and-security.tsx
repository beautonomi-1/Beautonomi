import { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, Switch } from "react-native";
import { api } from "@/lib/api-client";
import { ScreenFrame } from "@/components/ScreenFrame";
import { useBiometricAuth } from "@/hooks/useBiometricAuth";
import { Colors } from "@/constants/colors";

export default function LoginAndSecurityScreen() {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [updating, setUpdating] = useState(false);

  const biometric = useBiometricAuth();

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<any>("/api/me/profile");
      if (res.error) setError(res.error.message || "Failed to load");
      else setProfile(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const updatePassword = async () => {
    if (!password || password.length < 6) {
      Alert.alert("Error", "Password must be at least 6 characters");
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert("Error", "Passwords do not match");
      return;
    }
    setUpdating(true);
    try {
      const res = await api.put<any>("/api/me/password", { password });
      if (res.error) {
        Alert.alert("Error", res.error.message || "Failed to update password");
      } else {
        Alert.alert("Success", "Password updated.");
        setPassword("");
        setConfirmPassword("");
      }
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to update");
    } finally {
      setUpdating(false);
    }
  };

  const biometricLabel =
    biometric.biometricType === "face"
      ? "Face ID"
      : biometric.biometricType === "fingerprint"
        ? "fingerprint"
        : "biometrics";

  const handleBiometricToggle = async (value: boolean) => {
    if (value) {
      await biometric.enable();
    } else {
      await biometric.disable();
    }
  };

  return (
    <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}>
    <ScreenFrame loading={loading} error={error} onRetry={load}>
      {profile && (
        <View className="gap-6">
          {/* Biometric Login Section */}
          <View className="rounded-xl border border-gray-300 bg-white px-4 py-4">
            <View className="flex-row items-center justify-between">
              <View className="flex-1 mr-3">
                <Text className="text-base font-semibold text-gray-900">Biometric Login</Text>
                {biometric.isAvailable ? (
                  <Text className="text-sm text-gray-500 mt-1">
                    Use {biometricLabel} to sign in quickly
                  </Text>
                ) : (
                  <Text className="text-sm text-gray-400 mt-1">
                    Biometric authentication is not available on this device
                  </Text>
                )}
              </View>
              <Switch
                value={biometric.isEnabled}
                onValueChange={handleBiometricToggle}
                disabled={!biometric.isAvailable}
                trackColor={{ false: Colors.gray[300], true: Colors.primary }}
                thumbColor={Colors.white}
                accessibilityRole="switch"
                accessibilityLabel="Enable biometric login"
                accessibilityState={{ checked: biometric.isEnabled }}
              />
            </View>
          </View>

          {/* Password Change Section */}
          <View className="gap-4">
            <View>
              <Text className="text-sm font-medium text-gray-700 mb-1">New password</Text>
              <TextInput
                className="rounded-xl border border-gray-300 bg-white px-4 py-3 text-base text-gray-900"
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                secureTextEntry
              />
            </View>
            <View>
              <Text className="text-sm font-medium text-gray-700 mb-1">Confirm password</Text>
              <TextInput
                className="rounded-xl border border-gray-300 bg-white px-4 py-3 text-base text-gray-900"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="••••••••"
                secureTextEntry
              />
            </View>
            <TouchableOpacity
              onPress={updatePassword}
              disabled={updating}
              className="bg-primary py-3 rounded-xl items-center mt-4"
            >
              <Text className="text-white font-semibold">{updating ? "Updating..." : "Update password"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </ScreenFrame>
    </KeyboardAvoidingView>
  );
}
