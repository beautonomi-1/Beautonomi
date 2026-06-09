import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/ui/ScreenContainer";

/** Legacy clients summary screen — canonical surface is the detail report. */
export default function ClientsReportRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/(app)/(tabs)/more/reports/detail/client-summary" as never);
  }, [router]);

  return (
    <ScreenContainer scrollable={false}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    </ScreenContainer>
  );
}
