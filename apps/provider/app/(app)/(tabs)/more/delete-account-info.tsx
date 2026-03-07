import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Colors } from "@/constants/colors";

export default function DeleteAccountInfoScreen() {
  const router = useRouter();
  return (
    <ScreenContainer>
      <ScreenHeader title="Delete account" onBack={() => router.back()} />
      <View style={{ paddingHorizontal: 8, paddingTop: 16 }}>
        <Text style={{ fontSize: 16, color: Colors.gray[700], lineHeight: 24 }}>
          To permanently delete your account and all associated data, please use the web portal on a computer. This action cannot be undone.
        </Text>
        <Text style={{ marginTop: 16, fontSize: 14, color: Colors.gray[500] }}>
          Go to Settings → Privacy & sharing in the provider web app to start the deletion process.
        </Text>
      </View>
    </ScreenContainer>
  );
}
