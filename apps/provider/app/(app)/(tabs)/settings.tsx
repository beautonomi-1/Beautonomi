import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { useApi } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { twStyle } from "@/lib/twStyle";

interface ProviderProfile {
  id: string;
  business_name: string | null;
  description: string | null;
  business_type: string | null;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
  thumbnail_url: string | null;
  locations: { id: string; name: string; address_line1: string; city: string; location_type: string }[];
}

export default function SettingsScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { data: profile, loading, error, refresh } = useApi<ProviderProfile>("/api/provider/profile");

  const handleSignOut = async () => {
    await signOut();
    router.replace("/(auth)/login" as never);
  };

  if (loading && !profile) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Settings" />
        <View style={twStyle("flex-1 items-center justify-center py-12")}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !profile) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Settings" />
        <View style={twStyle("flex-1 justify-center px-4")}>
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  const businessName = profile?.business_name?.trim() || null;
  const phone = profile?.phone?.trim() || user?.phone || null;
  const email = profile?.email?.trim() || user?.email || null;

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title="Settings"
        rightAction={
          <TouchableOpacity
            onPress={() => router.push("/(app)/(tabs)/more/settings-hub" as never)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={twStyle("text-sm font-medium text-indigo-600")}>More settings</Text>
          </TouchableOpacity>
        }
      />
      <ScrollView
        style={twStyle("flex-1")}
        contentContainerStyle={twStyle("p-4 pb-24")}
        showsVerticalScrollIndicator={false}
      >
        <View style={twStyle("rounded-xl border border-gray-200 bg-white p-4")}>
          {businessName && (
            <Text style={twStyle("text-lg font-semibold text-gray-900")}>{businessName}</Text>
          )}
          {phone && (
            <Text style={twStyle("mt-1 text-gray-600")}>{phone}</Text>
          )}
          {email && (
            <Text style={twStyle("mt-0.5 text-gray-600")}>{email}</Text>
          )}
          {!businessName && !phone && !email && (
            <Text style={twStyle("text-gray-500")}>Provider account</Text>
          )}
        </View>

        <TouchableOpacity
          style={twStyle("mt-6 rounded-xl border border-gray-300 bg-white py-4 px-4")}
          onPress={handleSignOut}
          activeOpacity={0.7}
        >
          <Text style={twStyle("text-center font-semibold text-gray-900")}>Sign out</Text>
        </TouchableOpacity>
      </ScrollView>
    </ScreenContainer>
  );
}
