import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/lib/api-client";
import { Colors } from "@/constants/colors";
import { useResponsive } from "@/hooks/useResponsive";
import type { ExplorePost } from "@/types/api";
import { useTranslation } from "@beautonomi/i18n";

type CollectionData = {
  id: string;
  name: string;
  slug: string;
  post_count: number;
  posts: ExplorePost[];
};

const COLUMN_GAP = 8;
const COL_COUNT = 2;

export default function ExploreCollectionScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { contentPadding, contentMaxWidth } = useResponsive();
  const { width } = useWindowDimensions();
  const contentWidth = Math.min(width, contentMaxWidth) - contentPadding * 2;
  const tileWidth = (contentWidth - COLUMN_GAP * (COL_COUNT - 1)) / COL_COUNT;

  const [collection, setCollection] = useState<CollectionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!id) return;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const res = await api.get<CollectionData>(`/api/explore/collections/${id}`);
        if (res.error) {
          setError(res.error.message || "Could not load board");
        } else if (res.data && typeof res.data === "object" && "name" in res.data) {
          setCollection(res.data);
        } else {
          setError("Could not load board");
        }
      } catch {
        setError("Could not load board");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [id, t]
  );

  useEffect(() => {
    load();
  }, [load]);

  if (!id) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#fff", padding: 24 }}>
        <Text style={{ color: Colors.gray[500] }}>{t("customer.exploreCollection.notFound")}</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: Colors.primary, fontWeight: "600" }}>{t("customer.exploreCollection.goBack")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading && !collection) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (error || !collection) {
    return (
      <View style={{ flex: 1, padding: contentPadding, justifyContent: "center", alignItems: "center" }}>
        <Text style={{ fontSize: 16, color: Colors.gray[600], textAlign: "center" }}>
          {error || "Board not found"}
        </Text>
        {error && (
          <TouchableOpacity
            onPress={() => load()}
            style={{ marginTop: 12, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, backgroundColor: Colors.gray[100] }}
          >
            <Text style={{ color: Colors.primary, fontWeight: "600" }}>Retry</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={() => router.back()}
          style={{
            marginTop: 16,
            alignSelf: "center",
            paddingHorizontal: 20,
            paddingVertical: 10,
            backgroundColor: Colors.primary,
            borderRadius: 10,
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "600" }}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#fff" }}
      contentContainerStyle={{ padding: contentPadding, paddingBottom: 48 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Colors.primary} />
      }
    >
      <TouchableOpacity
        onPress={() => router.back()}
        style={{ flexDirection: "row", alignItems: "center", marginBottom: 16 }}
      >
        <Ionicons name="chevron-back" size={24} color={Colors.gray[700]} />
        <Text style={{ fontSize: 16, color: Colors.gray[700], marginLeft: 4 }}>Saved</Text>
      </TouchableOpacity>
      <Text style={{ fontSize: 22, fontWeight: "700", color: Colors.gray[900], marginBottom: 4 }}>
        {collection.name}
      </Text>
      <Text style={{ fontSize: 14, color: Colors.gray[500], marginBottom: 16 }}>
        {collection.post_count} saved post{collection.post_count === 1 ? "" : "s"}
      </Text>
      {collection.posts.length === 0 ? (
        <Text style={{ fontSize: 15, color: Colors.gray[600] }}>
          No posts in this board yet. Save posts from Explore and add them from your Saved tab.
        </Text>
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {collection.posts.map((post, index) => {
            const img = post.media_urls?.[0];
            return (
              <TouchableOpacity
                key={post.id}
                onPress={() =>
                  router.push({ pathname: "/(app)/explore-post", params: { id: post.id } })
                }
                style={{
                  width: tileWidth,
                  marginRight: index % COL_COUNT === 0 ? COLUMN_GAP : 0,
                  marginBottom: COLUMN_GAP,
                }}
              >
                <View style={{ borderRadius: 12, overflow: "hidden", backgroundColor: Colors.gray[100] }}>
                  <Image
                    source={{ uri: img || "https://placehold.co/400x500/f5f5f5/999?text=Beauty" }}
                    style={{ width: "100%", aspectRatio: 4 / 5 }}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                  {post.caption ? (
                    <Text
                      style={{ fontSize: 12, color: Colors.gray[700], padding: 8, lineHeight: 16 }}
                      numberOfLines={2}
                    >
                      {post.caption}
                    </Text>
                  ) : null}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}
