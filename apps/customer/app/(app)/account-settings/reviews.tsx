import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, RefreshControl } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { api } from "@/lib/api-client";
import { ScreenFrame } from "@/components/ScreenFrame";
import { Colors } from "@/constants/colors";

export default function ReviewsScreen() {
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
          className="flex-1"
          contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Colors.primary} />}
        >
          <View className="gap-3">
            {list.map((r: any) => {
              const provider = r.providers ?? r.provider;
              const booking = r.bookings ?? r.booking;
              return (
                <View key={r.id} className="bg-gray-50 rounded-xl p-4">
                  <View className="flex-row items-start justify-between">
                    <View className="flex-1">
                      <View className="flex-row items-center gap-2">
                        {provider?.thumbnail_url && (
                          <Image source={{ uri: provider.thumbnail_url }} style={{ width: 40, height: 40, borderRadius: 20 }} contentFit="cover" cachePolicy="memory-disk" transition={200} />
                        )}
                        <View>
                          <Text className="font-semibold text-gray-900">{provider?.business_name || "Provider"}</Text>
                          <View className="flex-row items-center gap-1 mt-0.5">
                            <Text className="text-yellow-500 text-sm">★</Text>
                            <Text className="text-sm font-medium text-gray-700">{r.rating}/5</Text>
                            {booking?.scheduled_at && (
                              <Text className="text-xs text-gray-500">
                                · {new Date(booking.scheduled_at).toLocaleDateString()}
                              </Text>
                            )}
                          </View>
                        </View>
                      </View>
                      <Text className="text-gray-600 mt-2">{r.comment || r.body || "No comment"}</Text>
                      {r.photos?.length > 0 && (
                        <View className="flex-row flex-wrap gap-2 mt-2">
                          {r.photos.slice(0, 3).map((url: string, i: number) => (
                            <Image key={i} source={{ uri: url }} style={{ width: 64, height: 64, borderRadius: 8 }} contentFit="cover" cachePolicy="memory-disk" transition={200} />
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
                      className="ml-2"
                    >
                      <Text className="text-primary font-medium">Edit</Text>
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
