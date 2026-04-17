import { useEffect } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { twStyle } from "@/lib/twStyle";

/**
 * Redirect route: forwards to the full messaging screen so deep links
 * (push notifications, legacy URLs, shared links) pointing at
 * `/(app)/chat/[id]` land in `/(app)/(tabs)/more/messaging/[id]` which
 * hosts the real conversation UI.
 */
export default function ChatRedirectScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const conversationId = typeof id === "string" ? id : Array.isArray(id) ? id[0] : undefined;

  useEffect(() => {
    if (!conversationId) {
      router.replace("/(app)/(tabs)/more/messaging" as never);
      return;
    }
    router.replace(`/(app)/(tabs)/more/messaging/${conversationId}` as never);
  }, [conversationId, router]);

  return (
    <ScreenContainer scrollable={false} edges={["top"]} reserveTabBarSpace={false}>
      <ScreenHeader title="Conversation" onBack={() => router.back()} />
      <View style={twStyle("flex-1 items-center justify-center py-12")}>
        <ActivityIndicator size="large" />
      </View>
    </ScreenContainer>
  );
}
