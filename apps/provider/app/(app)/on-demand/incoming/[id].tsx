import { useEffect, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { View, Text, TouchableOpacity, Alert } from "react-native";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { useFeatureFlag, useModuleConfig } from "@/providers/ConfigBundleProvider";
import { playRingtone } from "@/lib/on-demand/ringtone";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { twStyle } from "@/lib/twStyle";

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

function formatDateTimeSafe(value: unknown): string {
  if (typeof value !== "string" || !value) return "—";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "—";
  return parsed.toLocaleString();
}

export default function OnDemandIncomingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  // Guard: if no valid request id, redirect to bookings rather than hitting /requests/undefined
  useEffect(() => {
    if (!id) {
      router.replace("/(app)/(tabs)/bookings" as never);
    }
  }, [id, router]);

  const onDemandConfig = useModuleConfig("on_demand");
  const acceptGlobalEnabled = useFeatureFlag("on_demand_accept_enabled");
  const acceptProviderEnabled = useFeatureFlag("on_demand_accept_provider_enabled");
  const requestNowEnabled = Boolean(onDemandConfig?.enabled && acceptGlobalEnabled && acceptProviderEnabled);
  const ringtoneStopRef = useRef<(() => void) | null>(null);
  const { data, loading, error, refresh } = useApi<OnDemandRequest>(
    id ? `/api/provider/on-demand/requests/${id}` : "",
    { enabled: Boolean(id && requestNowEnabled) },
  );
  const { execute: acceptRequest, loading: accepting } = useApiMutation("post");
  const { execute: declineRequest, loading: declining } = useApiMutation("post");

  const request = data as OnDemandRequest | null;
  const isRequested = request?.status === "requested";
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!request?.expires_at) { setSecondsLeft(null); return; }
    const calc = () => Math.max(0, Math.floor((new Date(request.expires_at).getTime() - Date.now()) / 1000));
    setSecondsLeft(calc());
    const iv = setInterval(() => setSecondsLeft(calc()), 1000);
    return () => clearInterval(iv);
  }, [request?.expires_at]);

  const expired = secondsLeft !== null && secondsLeft <= 0;
  const canRespond = isRequested && !expired;

  // Play ringtone when incoming request is shown (same as web overlay)
  useEffect(() => {
    return () => {
      ringtoneStopRef.current?.();
    };
  }, []);
  useEffect(() => {
    if (!request?.id || request.status !== "requested" || expired) return;
    if (!onDemandConfig?.enabled || !onDemandConfig.ringtone_asset_path) return;
    ringtoneStopRef.current?.();
    playRingtone(onDemandConfig).then((ctrl) => {
      ringtoneStopRef.current = ctrl.stop;
    }).catch(() => {});
  }, [request?.id, request?.status, expired, onDemandConfig]);

  useEffect(() => {
    if (expired) ringtoneStopRef.current?.();
  }, [expired]);

  const handleAccept = async () => {
    ringtoneStopRef.current?.();
    const res = await acceptRequest(
      `/api/provider/on-demand/requests/${id}/accept`,
      {}
    );
    if (res.error) {
      Alert.alert("Could not accept", typeof res.error === "string" ? res.error : "Please try again.");
      return;
    }
    const payload = (res.data ?? {}) as { booking_id?: string };
    if (payload.booking_id) {
      router.replace(`/(app)/(tabs)/bookings/${payload.booking_id}` as never);
    } else {
      Alert.alert("Accepted", "The request was accepted successfully.");
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
            ringtoneStopRef.current?.();
            const res = await declineRequest(
              `/api/provider/on-demand/requests/${id}/decline`,
              {}
            );
            if (res.error) {
              Alert.alert("Could not decline", typeof res.error === "string" ? res.error : "Please try again.");
            } else {
              router.back();
            }
          },
        },
      ]
    );
  };

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false} edges={["top"]} reserveTabBarSpace={false}>
        <ScreenHeader title="Incoming request" onBack={() => router.back()} />
        <View style={twStyle("flex-1 items-center justify-center py-12")}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (!requestNowEnabled) {
    return (
      <ScreenContainer scrollable={false} edges={["top"]} reserveTabBarSpace={false}>
        <ScreenHeader title="Incoming request" onBack={() => router.back()} />
        <View style={twStyle("flex-1 justify-center px-4")}>
          <ErrorState
            message="Request Now is currently disabled. Enable it in platform settings and your online booking settings before accepting instant requests."
          />
        </View>
      </ScreenContainer>
    );
  }

  if (error || !request) {
    return (
      <ScreenContainer scrollable={false} edges={["top"]} reserveTabBarSpace={false}>
        <ScreenHeader title="Incoming request" onBack={() => router.back()} />
        <View style={twStyle("flex-1 justify-center px-4")}>
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
    <ScreenContainer edges={["top"]} reserveTabBarSpace={false}>
      <ScreenHeader title="Incoming request" onBack={() => router.back()} />
      <View style={twStyle("px-2 pt-4")}>
        {canRespond && (
          <View
            style={twStyle("mb-4 rounded-xl border-2 border-rose-300 bg-rose-50 px-4 py-3")}
            accessibilityRole="alert"
          >
            <Text style={twStyle("text-center text-sm font-bold text-rose-900")}>
              New on-demand request — accept or decline before it expires.
            </Text>
          </View>
        )}
        <View style={twStyle("rounded-xl border border-gray-200 bg-white p-4 mb-4")}>
          <View style={twStyle("flex-row items-center justify-between mb-3")}>
            <Text style={twStyle("font-semibold text-gray-900 capitalize")}>
              {request.status}
            </Text>
            {expired && (
              <View style={twStyle("rounded-full bg-gray-200 px-2 py-0.5")}>
                <Text style={twStyle("text-xs text-gray-600")}>Expired</Text>
              </View>
            )}
          </View>
          <Text style={twStyle("text-sm text-gray-500")}>
            Requested {formatDateTimeSafe(request.requested_at)}
          </Text>
          {request.expires_at && (
            <Text style={twStyle(`mt-1 text-xs ${expired ? "text-red-500 font-semibold" : secondsLeft !== null && secondsLeft <= 10 ? "text-orange-500 font-medium" : "text-gray-400"}`)}>
              {expired ? "Expired" : secondsLeft !== null ? `Expires in ${secondsLeft}s` : `Expires ${formatDateTimeSafe(request.expires_at)}`}
            </Text>
          )}
        </View>

        {services.length > 0 && (
          <View style={twStyle("rounded-xl border border-gray-200 bg-gray-50 p-4 mb-4")}>
            <Text style={twStyle("text-sm font-medium text-gray-700 mb-2")}>Services</Text>
            {services.map((s: { title?: string; duration_minutes?: number }, i: number) => (
              <Text key={i} style={twStyle("text-sm text-gray-600")}>
                {s.title ?? "Service"} {s.duration_minutes ? ` · ${s.duration_minutes} min` : ""}
              </Text>
            ))}
          </View>
        )}
        {scheduledAt && (
          <Text style={twStyle("text-sm text-gray-600 mb-4")}>
            Preferred time: {formatDateTimeSafe(scheduledAt)}
          </Text>
        )}

        {canRespond && (
          <View style={twStyle("flex-row mt-4")}>
            <TouchableOpacity
              onPress={handleDecline}
              disabled={declining}
              style={[twStyle("flex-1 rounded-xl border border-gray-200 py-3 items-center"), { marginRight: 12 }]}
              accessibilityLabel={declining ? "Declining request" : "Decline on-demand request"}
              accessibilityRole="button"
            >
              <Text style={twStyle("font-medium text-gray-700")}>
                {declining ? "Declining…" : "Decline"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleAccept}
              disabled={accepting}
              style={twStyle("flex-1 rounded-xl bg-gray-900 py-3 items-center")}
              accessibilityLabel={accepting ? "Accepting request" : "Accept on-demand request"}
              accessibilityRole="button"
            >
              <Text style={twStyle("font-medium text-white")}>
                {accepting ? "Accepting…" : "Accept"}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </ScreenContainer>
  );
}
