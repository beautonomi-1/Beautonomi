/**
 * Shown when provider profile/role bootstrap fails after login (network or API error).
 * Offers Retry via ProviderContext.refresh().
 */
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useProvider } from "@/providers/ProviderContext";
import { twStyle } from "@/lib/twStyle";
import { Colors } from "@/constants/colors";

export function ProfileLoadErrorBanner() {
  const { profileLoadError, loading, refresh } = useProvider();

  if (!profileLoadError) return null;

  return (
    <View style={twStyle("border-l-4 border-red-500 bg-red-50 px-4 py-3")}>
      <View style={twStyle("flex-row items-start")}>
        <Ionicons name="cloud-offline-outline" size={22} color="#b91c1c" style={{ marginRight: 10, marginTop: 2 }} />
        <View style={twStyle("flex-1")}>
          <Text style={twStyle("text-sm font-semibold text-red-900")}>Couldn&apos;t load business profile</Text>
          <Text style={twStyle("mt-1 text-xs text-red-800")}>{profileLoadError}</Text>
          <TouchableOpacity
            onPress={() => void refresh()}
            disabled={loading}
            style={twStyle("mt-3 flex-row items-center self-start rounded-lg bg-red-700 px-3 py-2")}
            accessibilityRole="button"
            accessibilityLabel="Retry loading profile"
          >
            {loading ? (
              <ActivityIndicator size="small" color={Colors.white} />
            ) : (
              <Text style={twStyle("text-sm font-semibold text-white")}>Retry</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
