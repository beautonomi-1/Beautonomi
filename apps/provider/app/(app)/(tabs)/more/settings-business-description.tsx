import { useState, useEffect, useCallback } from "react";
import { View, Text, TextInput, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Platform } from "react-native";
import { AppKeyboardAvoidingView as KeyboardAvoidingView } from "@/components/AppKeyboardAvoidingView";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ActionButton } from "@/components/ui/ActionButton";
import { Colors } from "@/constants/colors";

interface ProviderProfile {
  description?: string | null;
  business_name?: string | null;
}

const MAX_LENGTH = 2000;

function providerProfileFromApi(
  data: ProviderProfile | { data?: ProviderProfile } | null | undefined
): ProviderProfile {
  if (!data) return {};
  if (typeof data === "object" && "data" in data && data.data && typeof data.data === "object") {
    return data.data;
  }
  return data as ProviderProfile;
}

export default function SettingsBusinessDescriptionScreen() {
  const router = useRouter();
  const { data, loading, error, refresh } = useApi<ProviderProfile | { data?: ProviderProfile }>(
    "/api/provider/profile"
  );
  const { execute: patchProfile, loading: saving } = useApiMutation("patch");

  const profile = providerProfileFromApi(data);
  const [description, setDescription] = useState("");

  useEffect(() => {
    setDescription(profile.description ?? "");
  }, [profile.description]);

  const handleSave = useCallback(async () => {
    if (description.length > MAX_LENGTH) {
      Alert.alert("Validation", `Description must be ${MAX_LENGTH} characters or less.`);
      return;
    }
    const res = await patchProfile("/api/provider/profile", {
      description: description.trim() || null,
    }) as { error?: string };
    if (res.error) {
      Alert.alert("Error", res.error);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    }
  }, [description, patchProfile, router]);

  if (loading && profile.description === undefined && providerProfileFromApi(data).description === undefined) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Business description" onBack={() => router.back()} />
        <LoadingState message="Loading..." />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer keyboardAvoiding={false}>
      <ScreenHeader
        title="Business description"
        subtitle="Shown to customers"
        onBack={() => router.back()}
        rightAction={
          <TouchableOpacity
            onPress={handleSave}
            disabled={saving}
            style={{ minHeight: 40, flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 9999, backgroundColor: "#4f46e6", paddingHorizontal: 16 }}
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
            {error && (
              <View style={{ marginBottom: 12, borderRadius: 12, borderWidth: 1, borderColor: "#fecaca", backgroundColor: "#fef2f2", padding: 12 }}>
                <Text style={{ fontSize: 14, color: "#b91c1c" }}>{error}</Text>
                <TouchableOpacity onPress={() => refresh()} style={{ marginTop: 8 }}>
                  <Text style={{ fontSize: 14, fontWeight: "500", color: "#b91c1c" }}>Retry</Text>
                </TouchableOpacity>
              </View>
            )}

            <Text style={{ marginBottom: 4, fontSize: 14, fontWeight: "500", color: Colors.gray[700] }}>
              Description
            </Text>
            <TextInput
              style={{ borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.gray[900], minHeight: 140 }}
              placeholder="Describe your business for customers. What you offer, your style, experience, etc."
              placeholderTextColor="#9ca3af"
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={6}
              textAlignVertical="top"
              maxLength={MAX_LENGTH + 1}
              accessibilityLabel="Business description"
            />
            <Text style={{ marginTop: 4, fontSize: 12, color: Colors.gray[500] }}>
              {description.length} / {MAX_LENGTH} characters
            </Text>

            <View style={{ marginTop: 16 }}>
              <ActionButton
                label={saving ? "Saving..." : "Save description"}
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
