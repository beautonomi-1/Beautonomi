import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";

export default function DeleteAccountInfoScreen() {
  const router = useRouter();
  return (
    <ScreenContainer>
      <ScreenHeader title="Delete account" onBack={() => router.back()} />
      <View className="px-2 pt-4">
        <Text className="text-base text-gray-700 leading-6">
          To permanently delete your account and all associated data, please use the web portal on a computer. This action cannot be undone.
        </Text>
        <Text className="mt-4 text-sm text-gray-500">
          Go to Settings → Privacy & sharing in the provider web app to start the deletion process.
        </Text>
      </View>
    </ScreenContainer>
  );
}
