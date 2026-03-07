import { useLocalSearchParams, useRouter } from "expo-router";
import { View, Text } from "react-native";
import { useApi } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { twStyle } from "@/lib/twStyle";

type Conversation = {
  id: string;
  customer?: { full_name?: string } | null;
  last_message?: string | null;
};

export default function ChatScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, loading, error, refresh } = useApi<Conversation>(
    `/api/provider/conversations/${id}`
  );

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Conversation" onBack={() => router.back()} />
        <View style={twStyle("flex-1 items-center justify-center py-12")}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Conversation" onBack={() => router.back()} />
        <View style={twStyle("flex-1 justify-center px-4")}>
          <ErrorState message={error ?? "Conversation not found"} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  const conv = data as Conversation;
  const title = conv?.customer?.full_name ?? "Conversation";

  return (
    <ScreenContainer>
      <ScreenHeader title={title} onBack={() => router.back()} />
      <View style={twStyle("flex-1 px-2 pt-4")}>
        <View style={twStyle("rounded-xl border border-gray-200 bg-gray-50 p-4")}>
          <Text style={twStyle("text-sm text-gray-600")}>
            Full messaging is available in the provider dashboard on the web. You can view and reply to conversations there.
          </Text>
        </View>
      </View>
    </ScreenContainer>
  );
}
