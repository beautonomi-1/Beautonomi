import { Alert, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/providers/AuthProvider";
import { useProvider } from "@/providers/ProviderContext";
import { api } from "@/lib/api-client";
import { clearPortalCache } from "@/lib/portal-cache";
import { persistActiveProviderOrgHint } from "@/lib/active-provider-api-hint";
import { Colors } from "@/constants/colors";
import { useTranslation } from "@beautonomi/i18n";

/**
 * Staff who do not own a salon can start freelancer/salon onboarding,
 * or leave the current team (Fresha/Square-style memberships).
 */
export function StartOwnBusinessCard() {
  const { t } = useTranslation();
  const sb = (key: string, opts?: Record<string, unknown>) => t(`provider.mobile.components.startOwnBusiness.${key}`, opts) as string;
  const router = useRouter();
  const { user } = useAuth();
  const { provider, role, refresh } = useProvider();

  if (role !== "provider_staff") return null;

  const leaveTeam = () => {
    if (!provider?.id) return;
    Alert.alert(
      sb("leaveTitle"),
      sb("leaveBody", { name: provider.business_name ?? sb("thisSalon") }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: sb("leaveTeam"),
          style: "destructive",
          onPress: () => {
            void (async () => {
              const res = await api.post<{
                role?: string;
                active_provider_id?: string | null;
              }>("/api/provider/memberships/leave", {
                provider_id: provider.id,
              });
              if (res.error) {
                Alert.alert(sb("couldNotLeave"), res.error.message ?? sb("tryAgain"));
                return;
              }
              await clearPortalCache();
              const nextId = res.data?.active_provider_id ?? null;
              await persistActiveProviderOrgHint(user?.id, nextId);
              await refresh();
              if (res.data?.role === "provider_onboarding" || !nextId) {
                router.replace("/(app)/onboarding" as never);
              }
            })();
          },
        },
      ],
    );
  };

  return (
    <View
      style={{
        marginBottom: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "#e9d5ff",
        backgroundColor: "#faf5ff",
        padding: 16,
      }}
    >
      <Text style={{ fontSize: 11, fontWeight: "700", color: "#6b21a8", textTransform: "uppercase", letterSpacing: 0.6 }}>
        {sb("career")}
      </Text>
      <Text style={{ marginTop: 6, fontSize: 16, fontWeight: "700", color: "#111827" }}>
        {sb("readyTitle")}
      </Text>
      <Text style={{ marginTop: 4, fontSize: 13, color: "#4b5563" }}>
        {sb("readyBody")}
      </Text>
      <TouchableOpacity
        onPress={() => router.push("/(app)/onboarding/wizard" as never)}
        style={{
          marginTop: 12,
          backgroundColor: Colors.primary,
          borderRadius: 12,
          paddingVertical: 12,
          alignItems: "center",
        }}
        accessibilityRole="button"
        accessibilityLabel={sb("startA11y")}
      >
        <Text style={{ color: "#fff", fontWeight: "600" }}>{sb("startCta")}</Text>
      </TouchableOpacity>
      {provider?.id ? (
        <TouchableOpacity
          onPress={leaveTeam}
          style={{ marginTop: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}
          accessibilityRole="button"
          accessibilityLabel={sb("leaveThisTeamA11y")}
        >
          <Ionicons name="exit-outline" size={16} color="#6b7280" />
          <Text style={{ color: "#6b7280", fontSize: 13, fontWeight: "500" }}>{sb("leaveThisTeam")}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
