import { View, Text, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { useApi } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { getWebProviderBaseUrl } from "@/lib/web-url";
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
  const { data: status, loading, error, refresh } = useApi<AccountStatus>("/api/me/account-status");

  const openWebDeleteAccount = () => {
    const base = getWebProviderBaseUrl().replace(/\/$/, "");
    const url = `${base}/account-settings/privacy-and-sharing`;
    router.push({
      pathname: "/(app)/(tabs)/more/in-app-browser",
      params: {
        url: encodeURIComponent(url),
        title: encodeURIComponent("Privacy & delete account"),
      },
    } as never);
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
              Your account is currently deactivated. Log in again on the web to reactivate, or use the link below to permanently delete your account.
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
          To permanently delete your account and all associated data, please use the web portal. This action cannot be undone.
        </Text>
        <Text style={twStyle("mt-4 text-sm text-gray-500")}>
          Go to Settings → Privacy & sharing in the provider web app to start the deletion process.
        </Text>

        <TouchableOpacity
          onPress={openWebDeleteAccount}
          style={twStyle("mt-6 rounded-xl border border-gray-300 bg-white py-4 px-4")}
          activeOpacity={0.7}
        >
          <Text style={twStyle("text-center font-semibold text-gray-900")}>
            Open web to delete account
          </Text>
        </TouchableOpacity>
      </View>
    </ScreenContainer>
  );
}
