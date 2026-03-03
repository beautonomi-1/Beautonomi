import { View, Text, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { LoadingState } from "@/components/ui/LoadingState";

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

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <View className="flex-1 items-center justify-center py-12">
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <View className="flex-1 px-4 pt-12">
        <View className="items-center mb-8">
          <View className="h-16 w-16 items-center justify-center rounded-full bg-indigo-100 mb-4">
            <Ionicons name="business-outline" size={32} color="#4f46e5" />
          </View>
          <Text className="text-xl font-bold text-gray-900 text-center">
            {isComplete ? "You're all set" : "Welcome to Beautonomi"}
          </Text>
          <Text className="mt-2 text-center text-gray-600">
            {isComplete
              ? "Your business profile is set up. Start managing bookings and clients."
              : "Complete your business setup on the web for the best experience. You can use the app in the meantime."}
          </Text>
        </View>

        {!isComplete && pending.length > 0 && (
          <View className="rounded-xl border border-gray-200 bg-gray-50 p-4 mb-6">
            <Text className="text-sm font-medium text-gray-700 mb-2">Setup steps</Text>
            {pending.slice(0, 3).map((s) => (
              <Text key={s.id} className="text-sm text-gray-600">
                • {s.title}
              </Text>
            ))}
            <Text className="mt-3 text-xs text-gray-500">
              Complete these in the provider dashboard on the web.
            </Text>
          </View>
        )}

        <TouchableOpacity
          onPress={goToApp}
          className="rounded-xl bg-gray-900 py-4 items-center"
          activeOpacity={0.8}
          accessibilityLabel={isComplete ? "Go to dashboard" : "Continue to app"}
          accessibilityRole="button"
        >
          <Text className="text-base font-semibold text-white">
            {isComplete ? "Go to dashboard" : "Continue to app"}
          </Text>
        </TouchableOpacity>
      </View>
    </ScreenContainer>
  );
}
