import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, RefreshControl, Platform } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { api } from "@/lib/api-client";
import { useResponsive } from "@/hooks/useResponsive";
import { ScreenFrame } from "@/components/ScreenFrame";
import { Colors } from "@/constants/colors";

function formatDateSafe(value: unknown): string {
  if (typeof value !== "string" || !value) return "—";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "—";
  return parsed.toLocaleDateString();
}

export default function ReviewsScreen() {
  const { contentPadding, contentMaxWidth, isTablet } = useResponsive();
  const constraint = (isTablet || Platform.OS === "web") ? { maxWidth: contentMaxWidth, alignSelf: "center" as const, width: "100%" as const } : {};
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await api.get<any>("/api/me/reviews");
      if (res.error) setError(res.error.message || "Failed to load");
      else setData(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const reviews = (data?.reviews ?? data) || [];
  const list = Array.isArray(reviews) ? reviews : [];

  return (
    <ScreenFrame loading={loading} error={error} onRetry={load} empty={{ title: "No reviews yet" }} isEmpty={list.length === 0}>
      {list.length > 0 && (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: contentPadding, paddingBottom: 48, ...constraint }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Colors.primary} />}
        >
          <View>
            {list.map((r: any, index: number) => {
              const provider = r.providers ?? r.provider;
              const booking = r.bookings ?? r.booking;
              return (
                <View key={r.id} style={{ backgroundColor: Colors.gray[50], borderRadius: 12, padding: 16, marginTop: index === 0 ? 0 : 12 }}>
                  <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        {provider?.thumbnail_url && (
                          <Image source={{ uri: provider.thumbnail_url }} style={{ width: 40, height: 40, borderRadius: 20, marginRight: 8 }} contentFit="cover" cachePolicy="memory-disk" transition={200} />
                        )}
                        <View>
                          <Text style={{ fontWeight: "600", color: Colors.gray[900] }}>{provider?.business_name || "Provider"}</Text>
                          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2 }}>
                            <Text style={{ color: "#EAB308", fontSize: 14 }}>★</Text>
                            <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[700], marginLeft: 4 }}>{r.rating}/5</Text>
                            {booking?.scheduled_at && (
                              <Text style={{ fontSize: 12, color: Colors.gray[500], marginLeft: 4 }}>
                                · {formatDateSafe(booking.scheduled_at)}
                              </Text>
                            )}
                          </View>
                        </View>
                      </View>
                      <Text style={{ color: Colors.gray[600], marginTop: 8 }}>{r.comment || r.body || "No comment"}</Text>
                      {r.photos?.length > 0 && (
                        <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 8 }}>
                          {r.photos.slice(0, 3).map((url: string, i: number) => (
                            <Image key={i} source={{ uri: url }} style={{ width: 64, height: 64, borderRadius: 8, marginRight: 8, marginBottom: 8 }} contentFit="cover" cachePolicy="memory-disk" transition={200} />
                          ))}
                        </View>
                      )}
                    </View>
                    <TouchableOpacity
                      onPress={() =>
                        router.push({
                          pathname: "/(app)/review-write",
                          params: {
                            bookingId: r.booking_id,
                            reviewId: r.id,
                            rating: String(r.rating),
                            comment: r.comment || "",
                          },
                        })
                      }
                      style={{ marginLeft: 8 }}
                    >
                      <Text style={{ color: Colors.primary, fontWeight: "500" }}>Edit</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}
    </ScreenFrame>
  );
}
