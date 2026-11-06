import { useCallback } from "react";
import { ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "@beautonomi/i18n";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/providers/AuthProvider";
import { Colors } from "@/constants/colors";
import { SessionVerifyPanel, securityStyles } from "@/components/security/SessionVerifyPanel";

export default function SecurityVerifyScreen() {
  const { t } = useTranslation();
  const sk = (key: string) => t(`provider.mobile.screens.security.${key}`) as string;
  const router = useRouter();
  const { signOut } = useAuth();

  const onDone = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/" as never);
  }, [router]);

  const onSignOut = useCallback(() => {
    void signOut();
  }, [signOut]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.white }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24, justifyContent: "center" }} keyboardShouldPersistTaps="handled">
        <View style={{ marginBottom: 24 }}>
          <Text style={[securityStyles.title, { fontSize: 24 }]}>{sk("verifyScreenTitle")}</Text>
          <Text style={securityStyles.body}>{sk("verifyScreenBody")}</Text>
        </View>
        <SessionVerifyPanel onDone={onDone} onSignOut={onSignOut} />
      </ScrollView>
    </SafeAreaView>
  );
}
