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
  const [currentPassword, setCurrentPassword] = useState("");
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
    if (!currentPassword?.trim()) {
      Alert.alert("Error", "Enter your current password");
      return;
    }
    if (!password || password.length < 8) {
      Alert.alert("Error", "New password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert("Error", "New passwords do not match");
      return;
    }
    setUpdating(true);
    try {
      const res = await api.put<any>("/api/me/password", {
        currentPassword: currentPassword.trim(),
        newPassword: password,
      });
      if (res.error) {
        Alert.alert("Error", res.error.message || "Failed to update password");
      } else {
        Alert.alert("Success", "Password updated.");
        setCurrentPassword("");
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
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}>
    <ScreenFrame loading={loading} error={error} onRetry={load}>
      {profile && (
        <View>
          <View style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[300], backgroundColor: Colors.white, paddingHorizontal: 16, paddingVertical: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={{ fontSize: 16, fontWeight: "600", color: Colors.gray[900] }}>Biometric Login</Text>
                {biometric.isAvailable ? (
                  <Text style={{ fontSize: 14, color: Colors.gray[500], marginTop: 4 }}>
                    Use {biometricLabel} to sign in quickly
                  </Text>
                ) : (
                  <Text style={{ fontSize: 14, color: Colors.gray[400], marginTop: 4 }}>
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

          <View style={{ marginTop: 24 }}>
            <View>
              <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700], marginBottom: 4 }}>Current password</Text>
              <TextInput
                style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[300], backgroundColor: Colors.white, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
                value={currentPassword}
                onChangeText={setCurrentPassword}
                placeholder="••••••••"
                placeholderTextColor={Colors.gray[400]}
                secureTextEntry
              />
            </View>
            <View style={{ marginTop: 16 }}>
              <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700], marginBottom: 4 }}>New password</Text>
              <TextInput
                style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[300], backgroundColor: Colors.white, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
                value={password}
                onChangeText={setPassword}
                placeholder="At least 8 characters"
                placeholderTextColor={Colors.gray[400]}
                secureTextEntry
              />
            </View>
            <View style={{ marginTop: 16 }}>
              <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700], marginBottom: 4 }}>Confirm new password</Text>
              <TextInput
                style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[300], backgroundColor: Colors.white, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900] }}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="••••••••"
                placeholderTextColor={Colors.gray[400]}
                secureTextEntry
              />
            </View>
            <TouchableOpacity
              onPress={updatePassword}
              disabled={updating}
              style={{ backgroundColor: Colors.primary, paddingVertical: 12, borderRadius: 12, alignItems: "center", marginTop: 16 }}
            >
              <Text style={{ color: Colors.white, fontWeight: "600" }}>{updating ? "Updating..." : "Update password"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </ScreenFrame>
    </KeyboardAvoidingView>
  );
}
