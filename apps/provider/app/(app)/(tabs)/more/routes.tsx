import { useCallback, useState } from "react";
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Alert } from "react-native";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "@beautonomi/i18n";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Colors } from "@/constants/colors";
import { formatLocalYmd } from "@/lib/reportDateRanges";

type BookingRef = {
  ref_number?: string;
  scheduled_at?: string;
  customer?: { full_name?: string } | { full_name?: string }[] | null;
} | null;

type Segment = {
  id: string;
  segment_order?: number;
  order?: number;
  booking?: BookingRef;
  to_booking?: BookingRef;
};

function segmentBooking(seg: Segment): BookingRef {
  return seg.booking ?? seg.to_booking ?? null;
}

function customerNameFromBooking(b: BookingRef, fallback: string): string {
  if (!b?.customer) return fallback;
  const c = b.customer;
  if (Array.isArray(c)) return c[0]?.full_name ?? fallback;
  return c.full_name ?? fallback;
}

type RoutesResponse = {
  route?: { id: string } | null;
  segments?: Segment[];
};

function formatDateSafe(value: unknown, empty: string): string {
  if (typeof value !== "string" || !value) return empty;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return empty;
  return parsed.toLocaleDateString();
}

function formatTimeSafe(value: unknown, empty: string): string {
  if (typeof value !== "string" || !value) return empty;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return empty;
  return parsed.toLocaleTimeString();
}

export default function RoutesScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const rt = (key: string, opts?: Record<string, unknown>) =>
    t(`provider.mobile.screens.routes.${key}`, opts) as string;
  const [refreshing, setRefreshing] = useState(false);
  const date = formatLocalYmd(new Date());
  const { data, loading, error, refresh } = useApi<RoutesResponse>(
    `/api/provider/routes?date=${date}`
  );
  const { execute: optimizeRoute, loading: optimizing } = useApiMutation("post");

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const handleOptimize = useCallback(async () => {
    const { error: optimizeError } = await optimizeRoute("/api/provider/routes/optimize", { date });
    if (optimizeError) {
      Alert.alert(rt("optimizeFailed"), optimizeError);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    refresh();
  }, [date, optimizeRoute, refresh]);

  if (loading && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title={rt("title")} onBack={() => router.back()} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 48 }}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (error && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title={rt("title")} onBack={() => router.back()} />
        <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 16 }}>
          <ErrorState message={error} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  const res = data as RoutesResponse;
  const segments = res?.segments ?? [];

  return (
    <ScreenContainer>
      <ScreenHeader
        title={rt("title")}
        subtitle={rt("subtitle")}
        onBack={() => router.back()}
      />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ marginBottom: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], padding: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 14, color: Colors.gray[600] }}>
              {rt("routeFor", { date: formatDateSafe(date, rt("emptyValue")) })}
            </Text>
            <TouchableOpacity
              onPress={handleOptimize}
              disabled={optimizing}
              style={{
                borderRadius: 9999,
                backgroundColor: optimizing ? Colors.gray[300] : "#e0e7ff",
                paddingHorizontal: 12,
                paddingVertical: 6,
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: "600", color: optimizing ? Colors.gray[600] : "#3730a3" }}>
                {optimizing ? rt("optimizing") : rt("optimize")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        {segments.length === 0 ? (
          <View style={{ paddingVertical: 48, paddingHorizontal: 16, alignItems: "center" }}>
            <Ionicons name="navigate-outline" size={48} color="#9ca3af" />
            <Text style={{ marginTop: 16, textAlign: "center", color: Colors.gray[600] }}>{rt("emptyTitle")}</Text>
            <Text style={{ marginTop: 8, textAlign: "center", fontSize: 14, color: Colors.gray[500] }}>
              {rt("emptyHint")}
            </Text>
          </View>
        ) : (
          <View style={{ paddingBottom: 16 }}>
            {segments.map((seg, i) => {
              const b = segmentBooking(seg);
              return (
              <View
                key={seg.id}
                style={{ marginBottom: 12, flexDirection: "row", borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.white, padding: 16 }}
              >
                <View style={{ marginEnd: 12, height: 32, width: 32, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: "#e0e7ff" }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: "#3730a3" }}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: "500", color: Colors.gray[900] }}>
                    {customerNameFromBooking(b, rt("stopFallback"))}
                  </Text>
                  {b?.ref_number && (
                    <Text style={{ fontSize: 12, color: Colors.gray[500] }}>{b.ref_number}</Text>
                  )}
                  {b?.scheduled_at && (
                    <Text style={{ marginTop: 4, fontSize: 14, color: Colors.gray[600] }}>
                      {formatTimeSafe(b.scheduled_at, rt("emptyValue"))}
                    </Text>
                  )}
                </View>
              </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
