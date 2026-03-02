import { useState, useEffect, useCallback } from "react";
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
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ActionButton } from "@/components/ui/ActionButton";

interface ProviderProfile {
  description?: string | null;
  business_name?: string | null;
}

const MAX_LENGTH = 2000;

export default function SettingsBusinessDescriptionScreen() {
  const router = useRouter();
  const { data, loading, error, refresh } = useApi<ProviderProfile | { data?: ProviderProfile }>(
    "/api/provider/profile"
  );
  const { execute: patchProfile, loading: saving } = useApiMutation("patch");

  const profile = (data as ProviderProfile)?.description !== undefined
    ? (data as ProviderProfile)
    : (data as any)?.data ?? {};
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

  if (loading && profile.description === undefined && (data as any)?.data === undefined) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Business description" onBack={() => router.back()} />
        <LoadingState message="Loading..." />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader
        title="Business description"
        subtitle="Shown to customers"
        onBack={() => router.back()}
        rightAction={
          <TouchableOpacity
            onPress={handleSave}
            disabled={saving}
            className="min-h-[40px] flex-row items-center justify-center rounded-full bg-indigo-600 px-4"
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text className="font-medium text-white">Save</Text>
            )}
          </TouchableOpacity>
        }
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 100 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="px-2 pt-2">
            {error && (
              <View className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3">
                <Text className="text-sm text-red-700">{error}</Text>
                <TouchableOpacity onPress={() => refresh()} className="mt-2">
                  <Text className="text-sm font-medium text-red-700">Retry</Text>
                </TouchableOpacity>
              </View>
            )}

            <Text className="mb-1 text-sm font-medium text-gray-700">
              Description
            </Text>
            <TextInput
              className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900 min-h-[140px]"
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
            <Text className="mt-1 text-xs text-gray-500">
              {description.length} / {MAX_LENGTH} characters
            </Text>

            <View className="mt-4">
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
