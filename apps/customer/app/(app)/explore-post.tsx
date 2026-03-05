import { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Share,
  Alert,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
  Animated,
  FlatList,
  Pressable,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/providers/AuthProvider";
import { api } from "@/lib/api-client";
import { Colors } from "@/constants/colors";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { haptic } from "@/lib/haptics";
import { APP_URL } from "@/config/public-env";
import type { ExplorePost, ExploreComment } from "@/types/api";

function formatTime(iso: string) {
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function ExplorePostScreen() {
  useScreenTracking("Explore Post");
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { width: screenWidth } = useWindowDimensions();

  const [post, setPost] = useState<ExplorePost | null>(null);
  const [comments, setComments] = useState<ExploreComment[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [liking, setLiking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mediaIndex, setMediaIndex] = useState(0);

  const heartAnim = useRef(new Animated.Value(0)).current;

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [postRes, commentsRes] = await Promise.all([
        api.get<ExplorePost>(`/api/explore/posts/${id}`),
        api.get<ExploreComment[]>(`/api/explore/posts/${id}/comments`),
      ]);
      const postData = postRes.data as any;
      setPost(postData?.data ?? postData ?? null);
      const commentsData = commentsRes.data as any;
      const list = Array.isArray(commentsData) ? commentsData : commentsData?.data ?? [];
      setComments(list);
    } catch {
      setPost(null);
      setComments([]);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleLike = useCallback(async () => {
    if (!post || liking) return;
    setLiking(true);
    haptic.light();
    try {
      if (post.is_liked) {
        await api.delete(`/api/explore/events?post_id=${post.id}&event_type=like`);
        setPost((p) => (p ? { ...p, is_liked: false, like_count: Math.max(0, p.like_count - 1) } : null));
      } else {
        await api.post("/api/explore/events", {
          post_id: post.id,
          event_type: "like",
          idempotency_key: `like-${post.id}-${user?.id || "anon"}-${Date.now()}`,
        });
        setPost((p) => (p ? { ...p, is_liked: true, like_count: p.like_count + 1 } : null));
        const useNativeDriver = Platform.OS !== "web";
        Animated.sequence([
          Animated.spring(heartAnim, { toValue: 1, useNativeDriver, speed: 20, bounciness: 12 }),
          Animated.timing(heartAnim, { toValue: 0, duration: 500, useNativeDriver, delay: 300 }),
        ]).start();
      }
    } catch {} finally {
      setLiking(false);
    }
  }, [post, liking, user, heartAnim]);

  const toggleSave = useCallback(async () => {
    if (!post || saving) return;
    if (!user) {
      Alert.alert("Sign in to save", "Create an account or sign in to save posts.", [
        { text: "Cancel", style: "cancel" },
        { text: "Sign in", onPress: () => router.replace("/(auth)/login") },
      ]);
      return;
    }
    setSaving(true);
    haptic.light();
    try {
      if (post.is_saved) {
        await api.delete(`/api/explore/saved?post_id=${post.id}`);
        setPost((p) => (p ? { ...p, is_saved: false } : null));
      } else {
        await api.post("/api/explore/saved", { post_id: post.id });
        setPost((p) => (p ? { ...p, is_saved: true } : null));
      }
    } catch {} finally {
      setSaving(false);
    }
  }, [post, saving, user, router]);

  const sendComment = useCallback(async () => {
    const text = input.trim();
    if (!text || !id || sending || !user) return;
    setSending(true);
    setInput("");
    haptic.light();
    try {
      const res = await api.post<ExploreComment>(`/api/explore/posts/${id}/comments`, { body: text });
      const newComment = (res.data as any)?.data ?? res.data;
      if (newComment) {
        setComments((prev) => [
          ...prev,
          {
            ...newComment,
            body: newComment.body ?? text,
            author: { full_name: user.user_metadata?.full_name },
          },
        ]);
      }
    } catch {
      setInput(text);
    } finally {
      setSending(false);
    }
  }, [input, id, sending, user]);

  const handleShare = useCallback(() => {
    const message = post?.caption
      ? `${post.caption} — ${post.provider?.business_name || "Beautonomi"}`
      : `Check this out from ${post?.provider?.business_name || "Beautonomi"}`;
    Share.share({
      message,
      title: "Beautonomi",
      url: post?.id ? `${APP_URL}/explore/${post.id}` : undefined,
    }).catch(() => {});
  }, [post]);

  const goToProvider = useCallback(() => {
    if (post?.provider?.slug) {
      router.push({ pathname: "/(app)/partner-profile", params: { slug: post.provider.slug } });
    }
  }, [post, router]);

  if (loading && !post) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={{ flex: 1, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </>
    );
  }

  if (!post) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={{ flex: 1, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <Ionicons name="image-outline" size={48} color="#D1D5DB" />
          <Text style={{ color: "#6B7280", fontSize: 16, marginTop: 12 }}>Post not found</Text>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, marginTop: 16 }}
          >
            <Text style={{ color: "#fff", fontWeight: "600" }}>Go back</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  const images = post.media_urls?.length ? post.media_urls : [];
  const providerInitial = (post.provider?.business_name || "B").charAt(0).toUpperCase();

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: "#fff" }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          bounces
        >
          {/* Media */}
          {images.length > 0 ? (
            <View style={{ width: screenWidth, backgroundColor: "#F3F4F6" }}>
              <FlatList
                data={images}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(e) => setMediaIndex(Math.round(e.nativeEvent.contentOffset.x / screenWidth))}
                keyExtractor={(_, i) => String(i)}
                renderItem={({ item }) => (
                  <Image
                    source={{ uri: item }}
                    style={{ width: screenWidth, aspectRatio: 4 / 5 }}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={200}
                  />
                )}
              />

              {/* Double-tap heart overlay */}
              <Animated.View
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: heartAnim,
                  pointerEvents: "none",
                  transform: [{ scale: heartAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.3] }) }],
                }}
              >
                <Ionicons name="heart" size={72} color="#fff" />
              </Animated.View>

              {/* Back button */}
              <TouchableOpacity
                onPress={() => router.back()}
                style={{
                  position: "absolute",
                  top: 52,
                  left: 16,
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  backgroundColor: "rgba(0,0,0,0.35)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="arrow-back" size={20} color="#fff" />
              </TouchableOpacity>

              {/* Share button */}
              <TouchableOpacity
                onPress={handleShare}
                style={{
                  position: "absolute",
                  top: 52,
                  right: 16,
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  backgroundColor: "rgba(0,0,0,0.35)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="share-social-outline" size={20} color="#fff" />
              </TouchableOpacity>

              {/* Photo counter */}
              {images.length > 1 && (
                <View style={{ position: "absolute", bottom: 12, alignSelf: "center", backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <Text style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}>{mediaIndex + 1}/{images.length}</Text>
                </View>
              )}
            </View>
          ) : null}

          {/* Content */}
          <View style={{ padding: 16 }}>
            {/* Provider row */}
            <Pressable
              onPress={goToProvider}
              style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 }}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: Colors.primary,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: "#fff", fontSize: 17, fontWeight: "700" }}>{providerInitial}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: "700", color: "#111827" }}>
                  {post.provider?.business_name || "Provider"}
                </Text>
                {post.published_at ? (
                  <Text style={{ fontSize: 12, color: "#9CA3AF" }}>{formatTime(post.published_at)}</Text>
                ) : null}
              </View>
              {post.provider?.slug ? (
                <TouchableOpacity
                  onPress={goToProvider}
                  style={{
                    borderWidth: 1.5,
                    borderColor: Colors.primary,
                    borderRadius: 10,
                    paddingHorizontal: 14,
                    paddingVertical: 7,
                  }}
                >
                  <Text style={{ color: Colors.primary, fontWeight: "600", fontSize: 13 }}>View Profile</Text>
                </TouchableOpacity>
              ) : null}
            </Pressable>

            {/* Action bar */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 20, marginBottom: 16, paddingBottom: 16, borderBottomWidth: 1, borderColor: "#F3F4F6" }}>
              <TouchableOpacity
                onPress={toggleLike}
                disabled={liking}
                style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
              >
                <Ionicons
                  name={post.is_liked ? "heart" : "heart-outline"}
                  size={26}
                  color={post.is_liked ? Colors.primary : "#374151"}
                />
                <Text style={{ fontSize: 15, fontWeight: "600", color: post.is_liked ? Colors.primary : "#374151" }}>
                  {post.like_count > 0 ? post.like_count : "Like"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
              >
                <Ionicons name="chatbubble-outline" size={24} color="#374151" />
                <Text style={{ fontSize: 15, fontWeight: "600", color: "#374151" }}>
                  {comments.length > 0 ? comments.length : "Comment"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={toggleSave}
                disabled={saving}
                style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
              >
                <Ionicons
                  name={post.is_saved ? "bookmark" : "bookmark-outline"}
                  size={24}
                  color={post.is_saved ? Colors.primary : "#374151"}
                />
                <Text style={{ fontSize: 15, fontWeight: "600", color: post.is_saved ? Colors.primary : "#374151" }}>
                  Save
                </Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={handleShare}>
                <Ionicons name="paper-plane-outline" size={24} color="#374151" />
              </TouchableOpacity>
            </View>

            {/* Caption */}
            {post.caption ? (
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 15, color: "#111827", lineHeight: 24 }}>
                  <Text style={{ fontWeight: "700" }}>{post.provider?.business_name} </Text>
                  {post.caption}
                </Text>
              </View>
            ) : null}

            {/* Comments */}
            <Text style={{ fontSize: 16, fontWeight: "700", color: "#111827", marginBottom: 12 }}>
              Comments {comments.length > 0 ? `(${comments.length})` : ""}
            </Text>

            {comments.length === 0 ? (
              <View style={{ paddingVertical: 20, alignItems: "center" }}>
                <Ionicons name="chatbubbles-outline" size={28} color="#D1D5DB" />
                <Text style={{ fontSize: 13, color: "#9CA3AF", marginTop: 8 }}>No comments yet. Be the first!</Text>
              </View>
            ) : (
              comments.map((c) => {
                const initial = (c.author?.full_name || "U").charAt(0).toUpperCase();
                return (
                  <View key={c.id} style={{ flexDirection: "row", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderColor: "#F9FAFB" }}>
                    {c.author?.avatar_url ? (
                      <Image
                        source={{ uri: c.author.avatar_url }}
                        style={{ width: 32, height: 32, borderRadius: 16 }}
                        contentFit="cover"
                      />
                    ) : (
                      <View
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 16,
                          backgroundColor: "#F3F4F6",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text style={{ color: "#6B7280", fontWeight: "600", fontSize: 13 }}>{initial}</Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={{ fontSize: 13, fontWeight: "600", color: "#111827" }}>
                          {c.author?.full_name || "User"}
                        </Text>
                        <Text style={{ fontSize: 11, color: "#9CA3AF" }}>{formatTime(c.created_at)}</Text>
                      </View>
                      <Text style={{ fontSize: 14, color: "#374151", marginTop: 2, lineHeight: 20 }}>{c.body}</Text>
                    </View>
                  </View>
                );
              })
            )}

            <View style={{ height: 80 }} />
          </View>
        </ScrollView>

        {/* Comment input bar */}
        {user ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 16,
              paddingVertical: 10,
              paddingBottom: Platform.OS === "ios" ? 30 : 10,
              borderTopWidth: 1,
              borderColor: "#F3F4F6",
              backgroundColor: "#fff",
              gap: 10,
            }}
          >
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: Colors.primaryLight,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: Colors.primary, fontWeight: "700", fontSize: 13 }}>
                {(user.user_metadata?.full_name || "Y").charAt(0).toUpperCase()}
              </Text>
            </View>
            <TextInput
              style={{
                flex: 1,
                backgroundColor: "#F3F4F6",
                borderRadius: 999,
                paddingHorizontal: 16,
                paddingVertical: Platform.OS === "ios" ? 10 : 8,
                fontSize: 14,
                color: "#111827",
              }}
              placeholder="Add a comment..."
              placeholderTextColor="#9CA3AF"
              value={input}
              onChangeText={setInput}
              onSubmitEditing={sendComment}
              returnKeyType="send"
            />
            <TouchableOpacity
              onPress={sendComment}
              disabled={!input.trim() || sending}
              style={{ opacity: !input.trim() || sending ? 0.4 : 1 }}
            >
              {sending ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <Ionicons name="send" size={24} color={Colors.primary} />
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <Pressable
            onPress={() => router.replace("/(auth)/login")}
            style={{
              paddingHorizontal: 16,
              paddingVertical: 14,
              paddingBottom: Platform.OS === "ios" ? 30 : 14,
              borderTopWidth: 1,
              borderColor: "#F3F4F6",
              backgroundColor: "#fff",
              alignItems: "center",
            }}
          >
            <Text style={{ color: Colors.primary, fontWeight: "600", fontSize: 14 }}>
              Sign in to like, comment, and save
            </Text>
          </Pressable>
        )}
      </KeyboardAvoidingView>
    </>
  );
}
