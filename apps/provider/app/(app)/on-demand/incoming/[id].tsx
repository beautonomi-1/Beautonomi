import { useEffect, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { View, Text, TouchableOpacity, Alert } from "react-native";
import { useTranslation } from "@beautonomi/i18n";
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

function formatDateTimeSafe(value: unknown, empty: string): string {
  if (typeof value !== "string" || !value) return empty;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "—";
  return parsed.toLocaleString();
}

export default function OnDemandIncomingScreen() {
  const { t } = useTranslation();
  const od = (key: string, opts?: Record<string, unknown>) =>
    t(`provider.mobile.screens.onDemandIncoming.${key}`, opts) as string;
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
      Alert.alert(od("acceptFailedTitle"), typeof res.error === "string" ? res.error : od("tryAgain"));
      return;
    }
    const payload = (res.data ?? {}) as { booking_id?: string };
    if (payload.booking_id) {
      router.replace(`/(app)/(tabs)/bookings/${payload.booking_id}` as never);
    } else {
      Alert.alert(od("acceptedTitle"), od("acceptedBody"));
      router.back();
    }
  };

  const handleDecline = () => {
    Alert.alert(
      od("declineTitle"),
      od("declineBody"),
      [
        { text: od("cancel"), style: "cancel" },
        {
          text: od("decline"),
          style: "destructive",
          onPress: async () => {
            ringtoneStopRef.current?.();
            const res = await declineRequest(
              `/api/provider/on-demand/requests/${id}/decline`,
              {}
            );
            if (res.error) {
              Alert.alert(od("declineFailedTitle"), typeof res.error === "string" ? res.error : od("tryAgain"));
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
        <ScreenHeader title={od("title")} onBack={() => router.back()} />
        <View style={twStyle("flex-1 items-center justify-center py-12")}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (!requestNowEnabled) {
    return (
      <ScreenContainer scrollable={false} edges={["top"]} reserveTabBarSpace={false}>
        <ScreenHeader title={od("title")} onBack={() => router.back()} />
        <View style={twStyle("flex-1 justify-center px-4")}>
          <ErrorState
            message={od("disabled")}
          />
        </View>
      </ScreenContainer>
    );
  }

  if (error || !request) {
    return (
      <ScreenContainer scrollable={false} edges={["top"]} reserveTabBarSpace={false}>
        <ScreenHeader title={od("title")} onBack={() => router.back()} />
        <View style={twStyle("flex-1 justify-center px-4")}>
          <ErrorState
            message={error ?? od("notFound")}
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
      <ScreenHeader title={od("title")} onBack={() => router.back()} />
      <View style={twStyle("px-2 pt-4")}>
        {canRespond && (
          <View
            style={twStyle("mb-4 rounded-xl border-2 border-rose-300 bg-rose-50 px-4 py-3")}
            accessibilityRole="alert"
          >
            <Text style={twStyle("text-center text-sm font-bold text-rose-900")}>
              {od("banner")}
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
                <Text style={twStyle("text-xs text-gray-600")}>{od("expired")}</Text>
              </View>
            )}
          </View>
          <Text style={twStyle("text-sm text-gray-500")}>
            {od("requestedAt", { datetime: formatDateTimeSafe(request.requested_at, od("emptyDate")) })}
          </Text>
          {request.expires_at && (
            <Text style={twStyle(`mt-1 text-xs ${expired ? "text-red-500 font-semibold" : secondsLeft !== null && secondsLeft <= 10 ? "text-orange-500 font-medium" : "text-gray-400"}`)}>
              {expired ? od("expired") : secondsLeft !== null ? od("expiresIn", { count: secondsLeft }) : od("expiresAt", { datetime: formatDateTimeSafe(request.expires_at, od("emptyDate")) })}
            </Text>
          )}
        </View>

        {services.length > 0 && (
          <View style={twStyle("rounded-xl border border-gray-200 bg-gray-50 p-4 mb-4")}>
            <Text style={twStyle("text-sm font-medium text-gray-700 mb-2")}>{od("services")}</Text>
            {services.map((s: { title?: string; duration_minutes?: number }, i: number) => (
              <Text key={i} style={twStyle("text-sm text-gray-600")}>
                {s.title ?? od("serviceFallback")}{s.duration_minutes ? od("durationMin", { count: s.duration_minutes }) : ""}
              </Text>
            ))}
          </View>
        )}
        {scheduledAt && (
          <Text style={twStyle("text-sm text-gray-600 mb-4")}>
            {od("preferredTime", { datetime: formatDateTimeSafe(scheduledAt, od("emptyDate")) })}
          </Text>
        )}

        {canRespond && (
          <View style={twStyle("flex-row mt-4")}>
            <TouchableOpacity
              onPress={handleDecline}
              disabled={declining}
              style={[twStyle("flex-1 rounded-xl border border-gray-200 py-3 items-center"), { marginEnd: 12 }]}
              accessibilityLabel={declining ? od("decliningA11y") : od("declineA11y")}
              accessibilityRole="button"
            >
              <Text style={twStyle("font-medium text-gray-700")}>
                {declining ? od("declining") : od("decline")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleAccept}
              disabled={accepting}
              style={twStyle("flex-1 rounded-xl bg-gray-900 py-3 items-center")}
              accessibilityLabel={accepting ? od("acceptingA11y") : od("acceptA11y")}
              accessibilityRole="button"
            >
              <Text style={twStyle("font-medium text-white")}>
                {accepting ? od("accepting") : od("accept")}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </ScreenContainer>
  );
}
