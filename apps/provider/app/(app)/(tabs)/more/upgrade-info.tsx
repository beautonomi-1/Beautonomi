import { View, Text, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { getWebProviderBaseUrl } from "@/lib/web-url";
import { twStyle } from "@/lib/twStyle";

interface Plan {
  id: string;
  name: string;
  price_monthly?: number;
  price_yearly?: number;
  currency?: string;
  features?: unknown;
}

interface Subscription {
  id: string;
  status: string;
  plan_id?: string;
  plan?: Plan;
}

export default function UpgradeInfoScreen() {
  const router = useRouter();
  const { data: subscription, loading, error } = useApi<Subscription | null>("/api/provider/subscription");

  const openWebUpgrade = () => {
    const base = getWebProviderBaseUrl().replace(/\/$/, "");
    const url = `${base}/provider/settings/billing`;
    router.push({
      pathname: "/(app)/(tabs)/more/in-app-browser",
      params: {
        url: encodeURIComponent(url),
        title: encodeURIComponent("Billing & upgrade"),
      },
    } as never);
  };

  const planName = subscription?.plan?.name ?? null;
  const hasActive = subscription?.status === "active";

  if (loading && subscription == null) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Upgrade to Salon" onBack={() => router.back()} />
        <View style={twStyle("flex-1 items-center justify-center py-12")}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader title="Upgrade to Salon" onBack={() => router.back()} />
      <View style={twStyle("px-4 pt-4 pb-8")}>
        {error && (
          <View style={twStyle("mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3")}>
            <Text style={twStyle("text-sm text-amber-800")}>{error}</Text>
          </View>
        )}

        {planName && (
          <View style={twStyle("mb-4 rounded-xl border border-gray-200 bg-gray-50 p-4")}>
            <Text style={twStyle("text-sm font-medium text-gray-600")}>Current plan</Text>
            <Text style={twStyle("mt-1 text-base font-semibold text-gray-900")}>{planName}</Text>
            {hasActive && (
              <Text style={twStyle("mt-1 text-xs text-gray-500")}>Active subscription</Text>
            )}
          </View>
        )}

        <View style={twStyle("mb-4 flex-row items-center rounded-xl border border-pink-200 bg-pink-50 p-4")}>
          <Ionicons name="sparkles" size={28} color="#ec4899" />
          <Text style={twStyle("ml-3 flex-1 text-base font-medium text-pink-900")}>
            Unlock team management, multiple locations, and advanced features.
          </Text>
        </View>

        <Text style={twStyle("text-base text-gray-700 leading-6")}>
          To upgrade your plan from Freelancer to Salon, please use the web portal. There you can compare plans and complete the upgrade.
        </Text>
        <Text style={twStyle("mt-4 text-sm text-gray-500")}>
          Open the provider dashboard on web (More → Portal or open in app) and go to Settings or Billing to upgrade.
        </Text>

        <TouchableOpacity
          onPress={openWebUpgrade}
          style={twStyle("mt-6 rounded-xl border border-gray-300 bg-white py-4 px-4")}
          activeOpacity={0.7}
        >
          <Text style={twStyle("text-center font-semibold text-gray-900")}>
            Open web to upgrade plan
          </Text>
        </TouchableOpacity>
      </View>
    </ScreenContainer>
  );
}
