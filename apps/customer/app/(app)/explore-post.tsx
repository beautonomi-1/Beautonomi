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
  Keyboard,
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
import { useResponsive } from "@/hooks/useResponsive";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { haptic } from "@/lib/haptics";
import * as Clipboard from "expo-clipboard";
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
  const { contentPadding } = useResponsive();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [post, setPost] = useState<ExplorePost | null>(null);
  const [comments, setComments] = useState<ExploreComment[]>([]);
  const [relatedPosts, setRelatedPosts] = useState<ExplorePost[]>([]);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [liking, setLiking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mediaIndex, setMediaIndex] = useState(0);

  const heartAnim = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);
  const commentInputRef = useRef<TextInput>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [postRes, commentsRes, listRes] = await Promise.all([
        api.get<ExplorePost>(`/api/explore/posts/${id}`),
        api.get<ExploreComment[]>(`/api/explore/posts/${id}/comments`),
        api.get<ExplorePost[] | { data?: ExplorePost[] }>(`/api/explore/posts?limit=13`),
      ]);
      const postData = postRes.data as any;
      const loadedPost = postData?.data ?? postData ?? null;
      setPost(loadedPost);
      const commentsData = commentsRes.data as any;
      const list = Array.isArray(commentsData) ? commentsData : commentsData?.data ?? [];
      setComments(list);
      const rawList = listRes.data as ExplorePost[] | { data?: ExplorePost[] } | undefined;
      const items = Array.isArray(rawList) ? rawList : rawList?.data ?? [];
      const related = items.filter((p) => p.id !== id).slice(0, 12);
      setRelatedPosts(related);
    } catch {
      setPost(null);
      setComments([]);
      setRelatedPosts([]);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setCaptionExpanded(false);
  }, [id]);

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

  const postUrl = post?.id ? `${APP_URL}/explore/${post.id}` : "";
  const shareMessage = post?.caption
    ? `${post.caption} — ${post.provider?.business_name || "Beautonomi"}`
    : `Check this out from ${post?.provider?.business_name || "Beautonomi"}`;

  const handleShare = useCallback(() => {
    Share.share({
      message: shareMessage,
      title: "Beautonomi",
      url: postUrl || undefined,
    }).catch(() => {});
  }, [shareMessage, postUrl]);

  const focusCommentInput = useCallback(() => {
    if (!user) {
      router.replace("/(auth)/login");
      return;
    }
    Keyboard.dismiss();
    scrollRef.current?.scrollToEnd({ animated: true });
    setTimeout(() => commentInputRef.current?.focus(), 400);
  }, [user, router]);

  const showMoreOptions = useCallback(() => {
    haptic.light();
    Alert.alert("More options", undefined, [
      { text: "Cancel", style: "cancel" },
      { text: "Share", onPress: handleShare },
      {
        text: "Copy link",
        onPress: async () => {
          if (postUrl) {
            await Clipboard.setStringAsync(postUrl);
            haptic.light();
          }
        },
      },
    ]);
  }, [handleShare, postUrl]);

  const goToProvider = useCallback(() => {
    if (post?.provider?.slug) {
      router.push({ pathname: "/(app)/partner-profile", params: { slug: post.provider.slug } });
    }
  }, [post, router]);

  const goToBookThisLook = useCallback(() => {
    if (post?.provider?.slug && post?.offering?.id) {
      router.push({
        pathname: "/(app)/book",
        params: { slug: post.provider.slug, service_id: post.offering.id },
      });
    }
  }, [post?.provider?.slug, post?.offering?.id]);

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
        <View style={{ flex: 1, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", padding: contentPadding }}>
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
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0}
      >
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          bounces
          onScrollBeginDrag={() => Keyboard.dismiss()}
          keyboardDismissMode="on-drag"
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

              {/* More options */}
              <TouchableOpacity
                onPress={showMoreOptions}
                style={{
                  position: "absolute",
                  top: 52,
                  right: 62,
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  backgroundColor: "rgba(0,0,0,0.35)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="ellipsis-horizontal" size={20} color="#fff" />
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
          <View style={{ padding: contentPadding }}>
            {/* Provider row */}
            <Pressable
              onPress={goToProvider}
              style={{ flexDirection: "row", alignItems: "center", marginBottom: 14 }}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: Colors.primary,
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: 10,
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
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  {post.offering?.id ? (
                    <TouchableOpacity
                      onPress={goToBookThisLook}
                      style={{
                        borderWidth: 1.5,
                        borderColor: Colors.primary,
                        borderRadius: 10,
                        paddingHorizontal: 14,
                        paddingVertical: 7,
                        backgroundColor: Colors.primary,
                      }}
                    >
                      <Text style={{ color: "#fff", fontWeight: "600", fontSize: 13 }}>
                        Book this look{post.offering.name ? ` · ${post.offering.name}` : ""}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
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
                </View>
              ) : null}
            </Pressable>

            {/* Action bar */}
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 16, paddingBottom: 16, borderBottomWidth: 1, borderColor: "#F3F4F6" }}>
              <TouchableOpacity
                onPress={toggleLike}
                disabled={liking}
                style={{ flexDirection: "row", alignItems: "center", marginRight: 20 }}
              >
                <Ionicons
                  name={post.is_liked ? "heart" : "heart-outline"}
                  size={26}
                  color={post.is_liked ? Colors.primary : "#374151"}
                  style={{ marginRight: 6 }}
                />
                <Text style={{ fontSize: 15, fontWeight: "600", color: post.is_liked ? Colors.primary : "#374151" }}>
                  {post.like_count > 0 ? post.like_count : "Like"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={focusCommentInput}
                style={{ flexDirection: "row", alignItems: "center", marginRight: 20 }}
              >
                <Ionicons name="chatbubble-outline" size={24} color="#374151" style={{ marginRight: 6 }} />
                <Text style={{ fontSize: 15, fontWeight: "600", color: "#374151" }}>
                  {comments.length > 0 ? comments.length : "Comment"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={toggleSave}
                disabled={saving}
                style={{ flexDirection: "row", alignItems: "center", marginRight: 20 }}
              >
                <Ionicons
                  name={post.is_saved ? "bookmark" : "bookmark-outline"}
                  size={24}
                  color={post.is_saved ? Colors.primary : "#374151"}
                  style={{ marginRight: 6 }}
                />
                <Text style={{ fontSize: 15, fontWeight: "600", color: post.is_saved ? Colors.primary : "#374151" }}>
                  Save
                </Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={handleShare}>
                <Ionicons name="paper-plane-outline" size={24} color="#374151" />
              </TouchableOpacity>
            </View>

            {/* Caption (expandable when long) */}
            {post.caption ? (
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 15, color: "#111827", lineHeight: 24 }}>
                  <Text style={{ fontWeight: "700" }}>{post.provider?.business_name} </Text>
                  {captionExpanded || post.caption.length <= 120
                    ? post.caption
                    : `${post.caption.slice(0, 120)}...`}
                </Text>
                {post.caption.length > 120 ? (
                  <TouchableOpacity
                    onPress={() => {
                      haptic.light();
                      setCaptionExpanded((e) => !e);
                    }}
                    style={{ marginTop: 4 }}
                    accessibilityLabel={captionExpanded ? "Show less" : "Show more"}
                    accessibilityRole="button"
                  >
                    <Text style={{ fontSize: 14, color: "#6B7280", fontWeight: "500" }}>
                      {captionExpanded ? "less" : "more"}
                    </Text>
                  </TouchableOpacity>
                ) : null}
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
                  <View key={c.id} style={{ flexDirection: "row", paddingVertical: 10, borderBottomWidth: 1, borderColor: "#F9FAFB" }}>
                    {c.author?.avatar_url ? (
                      <Image
                        source={{ uri: c.author.avatar_url }}
                        style={{ width: 32, height: 32, borderRadius: 16, marginRight: 10 }}
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
                          marginRight: 10,
                        }}
                      >
                        <Text style={{ color: "#6B7280", fontWeight: "600", fontSize: 13 }}>{initial}</Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <Text style={{ fontSize: 13, fontWeight: "600", color: "#111827", marginRight: 6 }}>
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

            {/* More like this */}
            {relatedPosts.length > 0 ? (
              <View style={{ marginTop: 24, marginBottom: 16 }}>
                <Text style={{ fontSize: 16, fontWeight: "700", color: "#111827", marginBottom: 12 }}>
                  More like this
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", marginHorizontal: -6 }}>
                  {relatedPosts.slice(0, 6).map((p) => {
                    const img = p.media_urls?.[0];
                    return (
                      <TouchableOpacity
                        key={p.id}
                        onPress={() => {
                          haptic.light();
                          router.push({ pathname: "/(app)/explore-post", params: { id: p.id } });
                        }}
                        style={{
                          width: (screenWidth - contentPadding * 2 - 12) / 2,
                          marginHorizontal: 6,
                          marginBottom: 12,
                        }}
                        accessibilityLabel={`Post by ${p.provider?.business_name || "Provider"}`}
                        accessibilityRole="button"
                      >
                        <View style={{ borderRadius: 12, overflow: "hidden", backgroundColor: "#F3F4F6" }}>
                          <Image
                            source={{ uri: img || "https://placehold.co/400x500/f5f5f5/999?text=Beauty" }}
                            style={{ width: "100%", aspectRatio: 4 / 5 }}
                            contentFit="cover"
                            cachePolicy="memory-disk"
                          />
                          {p.caption ? (
                            <Text
                              style={{ fontSize: 12, color: "#374151", padding: 8, lineHeight: 16 }}
                              numberOfLines={2}
                            >
                              {p.caption}
                            </Text>
                          ) : null}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ) : null}

            <View style={{ height: 80 }} />
          </View>
        </ScrollView>

        {/* Comment input bar */}
        {user ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: contentPadding,
              paddingVertical: 10,
              paddingBottom: Platform.OS === "ios" ? 30 : 10,
              borderTopWidth: 1,
              borderColor: "#F3F4F6",
              backgroundColor: "#fff",
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
                marginRight: 10,
              }}
            >
              <Text style={{ color: Colors.primary, fontWeight: "700", fontSize: 13 }}>
                {(user.user_metadata?.full_name || "Y").charAt(0).toUpperCase()}
              </Text>
            </View>
            <TextInput
              ref={commentInputRef}
              style={{
                flex: 1,
                backgroundColor: "#F3F4F6",
                borderRadius: 999,
                paddingHorizontal: contentPadding,
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
              blurOnSubmit={false}
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
              paddingHorizontal: contentPadding,
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
