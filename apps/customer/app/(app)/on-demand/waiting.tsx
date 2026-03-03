import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "@/lib/api-client";
import { supabase } from "@/lib/supabase/client";
import { useModuleConfig } from "@/providers/ConfigBundleProvider";
import { Colors } from "@/constants/colors";

interface OnDemandRequest {
  id: string;
  status: string;
  expires_at: string;
  booking_id?: string | null;
}

export default function OnDemandWaitingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ requestId?: string }>();
  const requestId = params.requestId ?? "";
  const onDemandConfig = useModuleConfig("on_demand");
  const [request, setRequest] = useState<OnDemandRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = async () => {
    if (!requestId) return;
    try {
      const res = await api.get<OnDemandRequest>(`/api/me/on-demand/requests/${requestId}`);
      if (res.error) {
        setError(res.error.message ?? "Failed to load");
        setRequest(null);
      } else {
        setError(null);
        setRequest(res.data ?? null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setRequest(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!requestId) {
      setLoading(false);
      setError("No request ID");
      return;
    }
    load();
  }, [requestId]);

  useEffect(() => {
    if (!requestId) return;
    const channel = supabase
      .channel(`on-demand-${requestId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "on_demand_requests",
          filter: `id=eq.${requestId}`,
        },
        (payload) => {
          if (payload.new) {
            const row = payload.new as OnDemandRequest;
            setRequest(row);
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [requestId]);

  useEffect(() => {
    if (!requestId || !request) return;
    pollRef.current = setInterval(load, 12000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [requestId, request?.id]);

  useEffect(() => {
    if (!request?.expires_at || request.status !== "requested") return;
    const tick = () => {
      const now = new Date();
      const exp = new Date(request.expires_at);
      setSecondsLeft(Math.max(0, Math.ceil((exp.getTime() - now.getTime()) / 1000)));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [request?.expires_at, request?.status]);

  useEffect(() => {
    if (!request) return;
    if (request.status === "accepted") {
      if (request.booking_id) {
        router.replace({ pathname: "/(app)/booking-detail", params: { id: request.booking_id } });
      } else {
        router.replace({ pathname: "/(app)/on-demand/result", params: { status: "accepted", requestId } });
      }
      return;
    }
    if (["declined", "cancelled", "expired"].includes(request.status)) {
      router.replace({ pathname: "/(app)/on-demand/result", params: { status: request.status, requestId } });
    }
  }, [request?.status, request?.booking_id, requestId]);

  const handleCancel = async () => {
    if (!requestId || request?.status !== "requested") return;
    Alert.alert(
      "Cancel request",
      "Are you sure you want to cancel this request?",
      [
        { text: "Keep waiting", style: "cancel" },
        {
          text: "Cancel",
          style: "destructive",
          onPress: async () => {
            setCancelling(true);
            try {
              const res = await api.post(`/api/me/on-demand/requests/${requestId}/cancel`, {});
              if (res.error) Alert.alert("Error", res.error.message ?? "Failed to cancel");
              else load();
            } finally {
              setCancelling(false);
            }
          },
        },
      ]
    );
  };

  const uiCopy = (onDemandConfig.ui_copy ?? {}) as Record<string, string>;
  const title = uiCopy.waiting_title ?? "Waiting for provider";
  const subtitle = uiCopy.waiting_subtitle ?? "We'll hold this request for a short time.";
  const timerLabel = uiCopy.waiting_timer_label ?? "Time remaining";
  const cancelCta = uiCopy.waiting_cancel_cta ?? "Cancel request";

  if (!requestId) {
    return (
      <SafeAreaView className="flex-1 bg-white" edges={["top", "bottom"]}>
        <View className="flex-1 items-center justify-center p-4">
          <Text className="text-gray-600">Missing request ID</Text>
          <TouchableOpacity onPress={() => router.back()} className="mt-4 px-4 py-2 bg-gray-200 rounded-lg">
            <Text>Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (loading && !request) {
    return (
      <SafeAreaView className="flex-1 bg-white" edges={["top", "bottom"]}>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (error && !request) {
    return (
      <SafeAreaView className="flex-1 bg-white" edges={["top", "bottom"]}>
        <View className="flex-1 items-center justify-center p-4">
          <Text className="text-gray-600 mb-4">{error}</Text>
          <TouchableOpacity onPress={() => { setLoading(true); load(); }} className="px-4 py-2 bg-primary rounded-lg">
            <Text className="text-white">Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white" edges={["top", "bottom"]}>
      <View className="flex-1 px-6 pt-8">
        <View className="items-center mb-8">
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text className="text-xl font-semibold text-gray-900 mt-6">{title}</Text>
          <Text className="text-gray-600 text-center mt-2">{subtitle}</Text>
        </View>

        {secondsLeft !== null && (
          <View className="items-center py-6">
            <Text className="text-3xl font-mono font-semibold text-gray-900">
              {Math.floor(secondsLeft / 60)}:{(secondsLeft % 60).toString().padStart(2, "0")}
            </Text>
            <Text className="text-gray-500 text-sm mt-1">{timerLabel}</Text>
          </View>
        )}

        <View className="flex-1 justify-end pb-6">
          <TouchableOpacity
            onPress={handleCancel}
            disabled={cancelling}
            className="border border-gray-300 rounded-2xl py-4 items-center"
          >
            {cancelling ? (
              <ActivityIndicator size="small" color="#666" />
            ) : (
              <Text className="text-gray-700 font-medium">{cancelCta}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}
