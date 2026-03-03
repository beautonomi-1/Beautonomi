import { useLocalSearchParams, useRouter } from "expo-router";
import { View, Text, TouchableOpacity, Alert } from "react-native";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";

type OnDemandRequest = {
  id: string;
  status: string;
  requested_at: string;
  expires_at: string;
  request_payload?: {
    services?: { title?: string; duration_minutes?: number }[];
    scheduled_at?: string;
  };
};

export default function OnDemandIncomingScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, loading, error, refresh } = useApi<OnDemandRequest>(
    `/api/provider/on-demand/requests/${id}`
  );
  const { execute: acceptRequest, loading: accepting } = useApiMutation("post");
  const { execute: declineRequest, loading: declining } = useApiMutation("post");

  const request = data as OnDemandRequest | null;
  const isRequested = request?.status === "requested";
  const expired = request?.expires_at
    ? new Date(request.expires_at) <= new Date()
    : false;
  const canRespond = isRequested && !expired;

  const handleAccept = async () => {
    const res = await acceptRequest(
      `/api/provider/on-demand/requests/${id}/accept`,
      {}
    );
    if (!res.error) {
      router.back();
    }
  };

  const handleDecline = () => {
    Alert.alert(
      "Decline request",
      "Are you sure you want to decline this request?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Decline",
          style: "destructive",
          onPress: async () => {
            const res = await declineRequest(
              `/api/provider/on-demand/requests/${id}/decline`,
              {}
            );
            if (!res.error) router.back();
          },
        },
      ]
    );
  };

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Incoming request" onBack={() => router.back()} />
        <View className="flex-1 items-center justify-center py-12">
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error || !request) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Incoming request" onBack={() => router.back()} />
        <View className="flex-1 justify-center px-4">
          <ErrorState
            message={error ?? "Request not found"}
            onRetry={refresh}
          />
        </View>
      </ScreenContainer>
    );
  }

  const payload = request.request_payload ?? {};
  const services = payload.services ?? [];
  const scheduledAt = payload.scheduled_at;

  return (
    <ScreenContainer>
      <ScreenHeader title="Incoming request" onBack={() => router.back()} />
      <View className="px-2 pt-4">
        <View className="rounded-xl border border-gray-200 bg-white p-4 mb-4">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="font-semibold text-gray-900 capitalize">
              {request.status}
            </Text>
            {expired && (
              <View className="rounded-full bg-gray-200 px-2 py-0.5">
                <Text className="text-xs text-gray-600">Expired</Text>
              </View>
            )}
          </View>
          <Text className="text-sm text-gray-500">
            Requested {request.requested_at ? new Date(request.requested_at).toLocaleString() : "—"}
          </Text>
          {request.expires_at && (
            <Text className="mt-1 text-xs text-gray-400">
              Expires {new Date(request.expires_at).toLocaleString()}
            </Text>
          )}
        </View>

        {services.length > 0 && (
          <View className="rounded-xl border border-gray-200 bg-gray-50 p-4 mb-4">
            <Text className="text-sm font-medium text-gray-700 mb-2">Services</Text>
            {services.map((s: { title?: string; duration_minutes?: number }, i: number) => (
              <Text key={i} className="text-sm text-gray-600">
                {s.title ?? "Service"} {s.duration_minutes ? ` · ${s.duration_minutes} min` : ""}
              </Text>
            ))}
          </View>
        )}
        {scheduledAt && (
          <Text className="text-sm text-gray-600 mb-4">
            Preferred time: {new Date(scheduledAt).toLocaleString()}
          </Text>
        )}

        {canRespond && (
          <View className="flex-row gap-3 mt-4">
            <TouchableOpacity
              onPress={handleDecline}
              disabled={declining}
              className="flex-1 rounded-xl border border-gray-200 py-3 items-center"
              accessibilityLabel={declining ? "Declining request" : "Decline on-demand request"}
              accessibilityRole="button"
            >
              <Text className="font-medium text-gray-700">
                {declining ? "Declining…" : "Decline"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleAccept}
              disabled={accepting}
              className="flex-1 rounded-xl bg-gray-900 py-3 items-center"
              accessibilityLabel={accepting ? "Accepting request" : "Accept on-demand request"}
              accessibilityRole="button"
            >
              <Text className="font-medium text-white">
                {accepting ? "Accepting…" : "Accept"}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </ScreenContainer>
  );
}
