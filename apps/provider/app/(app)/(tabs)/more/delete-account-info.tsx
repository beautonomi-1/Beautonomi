import { useState } from "react";
import { View, Text, TouchableOpacity, TextInput, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { useAuth } from "@/providers/AuthProvider";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { twStyle } from "@/lib/twStyle";

interface AccountStatus {
  is_deactivated?: boolean;
  deactivated_at?: string;
  deactivated_by?: string | null;
  is_suspended?: boolean;
  suspension_reason?: string;
  suspended_at?: string;
  provider_id?: string;
}

export default function DeleteAccountInfoScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const { data: status, loading, error, refresh } = useApi<AccountStatus>("/api/me/account-status");
  const { execute: deleteAccount, loading: deleting } = useApiMutation("post");
  const [password, setPassword] = useState("");
  const [reason, setReason] = useState("");

  const handleDeleteAccount = async () => {
    if (!password.trim()) {
      Alert.alert("Password required", "Enter your password to confirm account deletion.");
      return;
    }
    Alert.alert(
      "Delete account permanently?",
      "This action cannot be undone and will permanently remove your account and profile data.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete permanently",
          style: "destructive",
          onPress: async () => {
            const { error: deleteError } = await deleteAccount("/api/me/delete-account", {
              password: password.trim(),
              reason: reason.trim() || "Deleted from mobile app",
            });
            if (deleteError) {
              Alert.alert("Could not delete account", deleteError);
              return;
            }
            await signOut();
            Alert.alert("Account deleted", "Your account has been deleted.");
            router.replace("/(auth)/login" as never);
          },
        },
      ]
    );
  };

  if (loading && status == null) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Delete account" onBack={() => router.back()} />
        <View style={twStyle("flex-1 items-center justify-center py-12")}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && status == null) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Delete account" onBack={() => router.back()} />
        <View style={twStyle("flex-1 justify-center px-4")}>
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  const isDeactivated = status?.is_deactivated === true;
  const isSuspended = status?.is_suspended === true;

  return (
    <ScreenContainer>
      <ScreenHeader title="Delete account" onBack={() => router.back()} />
      <View style={twStyle("px-4 pt-4 pb-8")}>
        {isDeactivated && (
          <View style={twStyle("mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4")}>
            <Text style={twStyle("font-medium text-amber-800")}>Account deactivated</Text>
            <Text style={twStyle("mt-1 text-sm text-amber-700")}>
              Your account is currently deactivated. You can still permanently delete it below.
            </Text>
          </View>
        )}

        {isSuspended && (
          <View style={twStyle("mb-4 rounded-xl border border-red-200 bg-red-50 p-4")}>
            <Text style={twStyle("font-medium text-red-800")}>Account suspended</Text>
            <Text style={twStyle("mt-1 text-sm text-red-700")}>
              {status?.suspension_reason ?? "Your account has been suspended. Please contact support."}
            </Text>
          </View>
        )}

        <Text style={twStyle("text-base text-gray-700 leading-6")}>
          Permanently delete your account and associated personal data directly from the app.
        </Text>
        <Text style={twStyle("mt-4 text-sm text-gray-500")}>
          Confirm your password to continue. This action cannot be undone.
        </Text>

        <View style={twStyle("mt-5 rounded-xl border border-gray-200 bg-white p-4")}>
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Current password</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            placeholder="Enter password"
            placeholderTextColor="#9ca3af"
            style={twStyle("mb-3 rounded-lg border border-gray-200 px-3 py-2.5 text-gray-900")}
          />
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Reason (optional)</Text>
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder="Why are you leaving?"
            placeholderTextColor="#9ca3af"
            multiline
            style={twStyle("min-h-[88px] rounded-lg border border-gray-200 px-3 py-2.5 text-gray-900")}
          />
        </View>

        <TouchableOpacity
          onPress={handleDeleteAccount}
          style={twStyle("mt-6 rounded-xl border border-red-300 bg-red-50 py-4 px-4")}
          activeOpacity={0.7}
          disabled={deleting}
        >
          <Text style={twStyle("text-center font-semibold text-red-700")}>
            {deleting ? "Deleting..." : "Delete account permanently"}
          </Text>
        </TouchableOpacity>
      </View>
    </ScreenContainer>
  );
}
