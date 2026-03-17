import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import { supabase } from "@/lib/supabase/client";
import { useModuleConfig } from "@/providers/ConfigBundleProvider";
import { Colors } from "@/constants/colors";
import { WaitingIllustration } from "@/components/on-demand/WaitingIllustration";
import { playRingtone } from "@/lib/on-demand/ringtone";

interface OnDemandRequest {
  id: string;
  status: string;
  expires_at: string;
  booking_id?: string | null;
  provider_name?: string | null;
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
        setError(getApiErrorMessage(res.error, "Failed to load"));
        setRequest(null);
      } else {
        setError(null);
        setRequest(res.data ?? null);
      }
    } catch (e) {
      setError(getApiErrorMessage(e, "Failed to load"));
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- load when requestId changes
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
            setRequest((prev) => ({
              ...row,
              provider_name: row.provider_name ?? prev?.provider_name ?? null,
            }));
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- load when request id available
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
    // Optimistic expiry: when timer hits 0, treat as expired (no dependency on cron)
    if (request.status === "requested" && secondsLeft !== null && secondsLeft <= 0) {
      router.replace({ pathname: "/(app)/on-demand/result", params: { status: "expired", requestId } });
      return;
    }
    if (request.status === "accepted") {
      playRingtone(onDemandConfig).catch(() => {});
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- router/request for redirect only
  }, [request?.status, request?.booking_id, requestId, secondsLeft]);

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
              const res = await api.post<OnDemandRequest>(`/api/me/on-demand/requests/${requestId}/cancel`, {});
              if (res.error) {
                Alert.alert("Error", getApiErrorMessage(res.error, "Failed to cancel"));
              } else {
                const updated = res.data;
                if (updated) setRequest(updated);
                else load();
              }
            } finally {
              setCancelling(false);
            }
          },
        },
      ]
    );
  };

  const uiCopy = (onDemandConfig.ui_copy ?? {}) as Record<string, string>;
  const title = uiCopy.waiting_title ?? "Request sent";
  const headline = uiCopy.waiting_headline ?? "Connecting you with beauty.";
  const providerMessageTemplate =
    uiCopy.waiting_provider_message ??
    "We'll confirm your booking as soon as we hear back from {provider_name}.";
  const providerDisplayName = request?.provider_name?.trim() || "your provider";
  const providerMessage = providerMessageTemplate.replace(
    /\{provider_name\}/gi,
    providerDisplayName
  );
  const timerLabel = uiCopy.waiting_timer_label ?? "Time remaining";
  const cancelCta = uiCopy.waiting_cancel_cta ?? "Cancel request";
  const helpUrl = uiCopy.waiting_help_url?.trim() || undefined;

  const shortRequestId = requestId
    ? `#${requestId.replace(/-/g, "").slice(-8).toUpperCase()}`
    : "";

  if (!requestId) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.white }} edges={["top", "bottom"]}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 16 }}>
          <Text style={{ color: Colors.gray[600] }}>Missing request ID</Text>
          <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: Colors.gray[200], borderRadius: 8 }}>
            <Text>Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (loading && !request) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.white }} edges={["top", "bottom"]}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (error && !request) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.white }} edges={["top", "bottom"]}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 16 }}>
          <Text style={{ color: Colors.gray[600], marginBottom: 16 }}>{error}</Text>
          <TouchableOpacity onPress={() => { setLoading(true); load(); }} style={{ paddingHorizontal: 16, paddingVertical: 8, backgroundColor: Colors.primary, borderRadius: 8 }}>
            <Text style={{ color: Colors.white }}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const openHelp = () => {
    if (helpUrl) Linking.openURL(helpUrl);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }} edges={["top", "bottom"]}>
      <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <Text style={{ fontSize: 18, fontWeight: "600", color: Colors.gray[900] }}>{title}</Text>
          {shortRequestId ? (
            <Text style={{ fontSize: 14, fontFamily: "monospace", color: Colors.gray[500] }}>{shortRequestId}</Text>
          ) : null}
        </View>
        {helpUrl ? (
          <TouchableOpacity onPress={openHelp} style={{ alignSelf: "flex-start", marginBottom: 16 }}>
            <Text style={{ fontSize: 14, color: Colors.primary, fontWeight: "500" }}>Help</Text>
          </TouchableOpacity>
        ) : null}

        <WaitingIllustration />

        <Text style={{ fontSize: 20, fontWeight: "600", color: Colors.gray[900], textAlign: "center", marginTop: 8 }}>{headline}</Text>
        <Text style={{ color: Colors.gray[600], textAlign: "center", marginTop: 12, paddingHorizontal: 8 }}>{providerMessage}</Text>

        {secondsLeft !== null && (
          <View style={{ alignItems: "center", paddingVertical: 32 }}>
            <Text style={{ fontSize: 30, fontFamily: "monospace", fontWeight: "600", color: Colors.gray[900] }}>
              {Math.floor(secondsLeft / 60)}:{(secondsLeft % 60).toString().padStart(2, "0")}
            </Text>
            <Text style={{ color: Colors.gray[500], fontSize: 14, marginTop: 4 }}>{timerLabel}</Text>
          </View>
        )}

        <View style={{ flex: 1, justifyContent: "flex-end", paddingBottom: 24 }}>
          <TouchableOpacity
            onPress={handleCancel}
            disabled={cancelling}
            style={{ borderWidth: 1, borderColor: Colors.gray[300], borderRadius: 16, paddingVertical: 16, alignItems: "center", backgroundColor: Colors.white }}
          >
            {cancelling ? (
              <ActivityIndicator size="small" color="#666" />
            ) : (
              <Text style={{ color: Colors.gray[700], fontWeight: "500" }}>{cancelCta}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}
