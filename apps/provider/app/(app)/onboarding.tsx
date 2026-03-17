import { View, Text, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { twStyle } from "@/lib/twStyle";
import { APP_URL } from "@/config/public-env";

type SetupStatus = {
  isComplete?: boolean;
  completionPercentage?: number;
  steps?: { id: string; title: string; completed: boolean }[];
};

export default function OnboardingScreen() {
  const router = useRouter();
  const { data, loading } = useApi<SetupStatus>("/api/provider/setup-status");

  const status = data as SetupStatus | null;
  const isComplete = status?.isComplete ?? false;
  const steps = status?.steps ?? [];
  const pending = steps.filter((s) => !s.completed);

  const goToApp = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.replace("/(app)/(tabs)" as never);
  };

  const goToSetupStatus = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/(app)/(tabs)/more/settings/setup-status" as never);
  };

  const openWebOnboarding = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const base = (APP_URL || "").replace(/\/$/, "");
    if (!base) {
      router.replace("/(app)/(tabs)" as never);
      return;
    }
    const url = `${base}/provider/onboarding`;
    router.push({
      pathname: "/(app)/(tabs)/more/in-app-browser",
      params: { url: encodeURIComponent(url), title: "Complete setup" },
    } as never);
  };

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <View style={twStyle("flex-1 items-center justify-center py-12")}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader title="Setup" showBack={false} />
      <View style={twStyle("flex-1 px-4 pt-4")}>
        <View style={twStyle("items-center mb-8")}>
          <View style={twStyle("h-16 w-16 items-center justify-center rounded-full bg-indigo-100 mb-4")}>
            <Ionicons name="business-outline" size={32} color="#4f46e5" />
          </View>
          <Text style={twStyle("text-xl font-bold text-gray-900 text-center")}>
            {isComplete ? "You're all set" : "Welcome to Beautonomi"}
          </Text>
          <Text style={twStyle("mt-2 text-center text-gray-600")}>
            {isComplete
              ? "Your business profile is set up. Start managing bookings and clients."
              : "Complete your business setup on the web for the best experience. You can use the app in the meantime."}
          </Text>
        </View>

        {!isComplete && pending.length > 0 && (
          <View style={twStyle("rounded-xl border border-gray-200 bg-gray-50 p-4 mb-6")}>
            <Text style={twStyle("text-sm font-medium text-gray-700 mb-2")}>Setup steps</Text>
            {pending.slice(0, 3).map((s) => (
              <Text key={s.id} style={twStyle("text-sm text-gray-600")}>
                • {s.title}
              </Text>
            ))}
            <Text style={twStyle("mt-3 text-xs text-gray-500")}>
              Complete each step in the app or open the full setup on the web.
            </Text>
          </View>
        )}

        {!isComplete && (
          <TouchableOpacity
            onPress={goToSetupStatus}
            style={twStyle("mb-4 rounded-xl border-2 border-indigo-500 bg-indigo-50 py-4 items-center")}
            activeOpacity={0.8}
            accessibilityLabel="Complete setup in app"
            accessibilityRole="button"
          >
            <Text style={twStyle("text-base font-semibold text-indigo-700")}>
              Complete setup in app
            </Text>
            <Text style={twStyle("text-xs text-indigo-600 mt-1")}>
              Native steps — business, locations, hours, gallery, services
            </Text>
          </TouchableOpacity>
        )}

        {!isComplete && APP_URL && (
          <TouchableOpacity
            onPress={openWebOnboarding}
            style={twStyle("mb-4 rounded-xl border border-gray-300 bg-white py-4 items-center")}
            activeOpacity={0.8}
            accessibilityLabel="Open full setup on web"
            accessibilityRole="button"
          >
            <Text style={twStyle("text-base font-medium text-gray-700")}>
              Open full setup on web
            </Text>
            <Text style={twStyle("text-xs text-gray-500 mt-1")}>
              Opens in app browser
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={goToApp}
          style={twStyle("rounded-xl bg-gray-900 py-4 items-center")}
          activeOpacity={0.8}
          accessibilityLabel={isComplete ? "Go to dashboard" : "Continue to app"}
          accessibilityRole="button"
        >
          <Text style={twStyle("text-base font-semibold text-white")}>
            {isComplete ? "Go to dashboard" : "Continue to app"}
          </Text>
        </TouchableOpacity>
      </View>
    </ScreenContainer>
  );
}
