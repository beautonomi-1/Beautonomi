import { useEffect, useState, useCallback, useRef } from "react";
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert, Keyboard, Platform, useWindowDimensions, Animated, FlatList, Pressable } from "react-native";
import { AppKeyboardAvoidingView as KeyboardAvoidingView } from "@/components/AppKeyboardAvoidingView";
import { Image } from "expo-image";
import { Video, ResizeMode } from "expo-av";
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
import { horizontalFlatListPerf } from "@/lib/flatListPerformance";
import { useTranslation } from "@beautonomi/i18n";
import { pushCustomerLogin } from "@/lib/guest-browse-policy";
import { useSocialCapability } from "@/hooks/useSafetySettings";
import { useUserBlocks } from "@/hooks/useUserBlocks";
import { ContentReportSheet, type ContentReportTargetType } from "@/components/safety/ContentReportSheet";
import {
  copyExplorePostLink,
  isExploreVideoUrl,
  presentExplorePostShareActions,
  shareExplorePostLink,
  shareExplorePostMedia,
  type ExploreShareAction,
} from "@/lib/share-explore-post";

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
  const { t } = useTranslation();
  const socialInteractions = useSocialCapability("comment");
  const canInteract = socialInteractions.allowed;
  const { confirmBlockUser } = useUserBlocks();

  const [post, setPost] = useState<ExplorePost | null>(null);
  const [comments, setComments] = useState<ExploreComment[]>([]);
  const [relatedPosts, setRelatedPosts] = useState<ExplorePost[]>([]);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [sending, setSending] = useState(false);
  const [liking, setLiking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mediaIndex, setMediaIndex] = useState(0);
  const [reportTarget, setReportTarget] = useState<{ type: ContentReportTargetType; id: string; title?: string } | null>(null);

  const explorePostReturnTo = id
    ? `/(app)/explore-post?id=${encodeURIComponent(id)}`
    : "/(app)/(tabs)/explore";

  const openContentReport = useCallback(
    (type: ContentReportTargetType, targetId: string, title?: string) => {
      if (!user) {
        Alert.alert(
          t("customer.contentReport.signInTitle"),
          t("customer.contentReport.signInBody"),
          [
            { text: t("common.cancel"), style: "cancel" },
            { text: t("auth.login"), onPress: () => pushCustomerLogin(explorePostReturnTo) },
          ],
        );
        return;
      }
      haptic.light();
      setReportTarget({ type, id: targetId, title });
    },
    [explorePostReturnTo, t, user],
  );

  const heartAnim = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);
  const commentInputRef = useRef<TextInput>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setLoadError(false);
    try {
      const [postRes, commentsRes, listRes] = await Promise.all([
        api.get<ExplorePost>(`/api/explore/posts/${id}`),
        api.get<ExploreComment[]>(`/api/explore/posts/${id}/comments`),
        api.get<ExplorePost[] | { data?: ExplorePost[] }>(`/api/explore/posts?limit=13`),
      ]);
      if (postRes.error) {
        setLoadError(true);
        setPost(null);
        return;
      }
      const postData = postRes.data as any;
      const loadedPost = postData?.data ?? postData ?? null;
      setPost(loadedPost);
      const commentsData = commentsRes.error ? [] : commentsRes.data as any;
      const list = Array.isArray(commentsData) ? commentsData : commentsData?.data ?? [];
      setComments(list);
      const rawList = listRes.error ? [] : listRes.data as ExplorePost[] | { data?: ExplorePost[] } | undefined;
      const items = Array.isArray(rawList) ? rawList : rawList?.data ?? [];
      const related = items.filter((p) => p.id !== id).slice(0, 12);
      setRelatedPosts(related);
    } catch {
      setLoadError(true);
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
    if (!user) {
      Alert.alert(
        t("customer.explorePost.signInToLikeTitle"),
        t("customer.explorePost.signInToLikeBody"),
        [
          { text: t("common.cancel"), style: "cancel" },
            { text: t("auth.login"), onPress: () => pushCustomerLogin(explorePostReturnTo) },
        ],
      );
      return;
    }
    setLiking(true);
    haptic.light();
    const prevLiked = post.is_liked;
    const prevCount = post.like_count;
    setPost((p) => p ? { ...p, is_liked: !prevLiked, like_count: prevLiked ? Math.max(0, p.like_count - 1) : p.like_count + 1 } : null);
    try {
      const res = prevLiked
        ? await api.delete(`/api/explore/events?post_id=${post.id}&event_type=like`)
        : await api.post("/api/explore/events", {
            post_id: post.id,
            event_type: "like",
            idempotency_key: `like-${post.id}-${user.id}-${Date.now()}`,
          });
      if (res.error) {
        setPost((p) => p ? { ...p, is_liked: prevLiked, like_count: prevCount } : null);
      } else if (!prevLiked) {
        const useNativeDriver = Platform.OS !== "web";
        Animated.sequence([
          Animated.spring(heartAnim, { toValue: 1, useNativeDriver, speed: 20, bounciness: 12 }),
          Animated.timing(heartAnim, { toValue: 0, duration: 500, useNativeDriver, delay: 300 }),
        ]).start();
      }
    } catch {
      setPost((p) => p ? { ...p, is_liked: prevLiked, like_count: prevCount } : null);
    } finally {
      setLiking(false);
    }
  }, [post, liking, user, heartAnim, router, t]);

  const toggleSave = useCallback(async () => {
    if (!post || saving) return;
    if (!user) {
      Alert.alert(
        t("customer.explorePost.signInToSaveTitle"),
        t("customer.explorePost.signInToSaveBody"),
        [
          { text: t("common.cancel"), style: "cancel" },
            { text: t("auth.login"), onPress: () => pushCustomerLogin(explorePostReturnTo) },
        ],
      );
      return;
    }
    setSaving(true);
    haptic.light();
    try {
      const wasSaved = post.is_saved;
      const res = wasSaved
        ? await api.delete(`/api/explore/saved?post_id=${post.id}`)
        : await api.post("/api/explore/saved", { post_id: post.id });
      if (!res.error) {
        setPost((p) => (p ? { ...p, is_saved: !wasSaved } : null));
      }
    } catch {
      /* network error — state unchanged */
    } finally {
      setSaving(false);
    }
  }, [post, saving, user, router, t]);

  const sendComment = useCallback(async () => {
    const text = input.trim();
    if (!text || !id || sending || !user) return;
    setSending(true);
    setInput("");
    haptic.light();
    try {
      const res = await api.post<ExploreComment>(`/api/explore/posts/${id}/comments`, { body: text });
      if (res.error) {
        setInput(text);
        Alert.alert(t("common.error"), t("customer.explorePost.errorPostComment"));
        return;
      }
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
      Alert.alert(t("common.error"), t("customer.explorePost.errorPostComment"));
    } finally {
      setSending(false);
    }
  }, [input, id, sending, user, t]);

  const postUrl = post?.id ? `${APP_URL}/explore/${post.id}` : "";

  const shareInput = useCallback(() => {
    if (!post) return null;
    return {
      postId: post.id,
      caption: post.caption,
      providerName: post.provider?.business_name || "Beautonomi",
      providerSlug: post.provider?.slug,
      mediaUrls: post.media_urls,
      webBaseUrl: APP_URL,
      mediaIndex,
    };
  }, [post, mediaIndex]);

  const runShareAction = useCallback(
    async (action: ExploreShareAction) => {
      const input = shareInput();
      if (!input) return;
      haptic.light();
      if (action === "link") {
        await shareExplorePostLink(input);
      } else if (action === "media") {
        await shareExplorePostMedia(input);
      } else if (action === "copy") {
        await copyExplorePostLink(input);
        Alert.alert(t("customer.explorePost.linkCopied"));
      }
    },
    [shareInput, t],
  );

  const handleShare = useCallback(() => {
    const input = shareInput();
    if (!input) return;
    void presentExplorePostShareActions(
      input,
      {
        sheetTitle: t("customer.explorePost.shareSheetTitle"),
        shareLink: t("customer.explorePost.shareLink"),
        shareMedia: t("customer.explorePost.sharePhoto"),
        shareMediaVideo: t("customer.explorePost.shareVideo"),
        copyLink: t("customer.explorePost.copyLink"),
        cancel: t("common.cancel"),
      },
      runShareAction,
    );
  }, [runShareAction, shareInput, t]);

  const focusCommentInput = useCallback(() => {
    if (!user) {
      pushCustomerLogin(explorePostReturnTo);
      return;
    }
    Keyboard.dismiss();
    scrollRef.current?.scrollToEnd({ animated: true });
    setTimeout(() => commentInputRef.current?.focus(), 400);
  }, [explorePostReturnTo, user]);

  const showMoreOptions = useCallback(() => {
    haptic.light();
    const actions: Array<{ text: string; onPress?: () => void; style?: "cancel" | "destructive" }> = [
      { text: t("common.share"), onPress: handleShare },
      {
        text: t("customer.explorePost.copyLink"),
        onPress: async () => {
          if (postUrl) {
            await Clipboard.setStringAsync(postUrl);
            haptic.light();
          }
        },
      },
    ];
    if (user && post?.id) {
      actions.push({
        text: t("customer.contentReport.reportPost"),
        style: "destructive",
        onPress: () => openContentReport("explore_post", post.id, t("customer.contentReport.reportPost")),
      });
    }
    if (user && post?.provider_id) {
      actions.push({
        text: t("customer.blockUser.confirmAction"),
        style: "destructive",
        onPress: () =>
          confirmBlockUser({
            providerId: post.provider_id,
            displayName: post.provider?.business_name,
            onBlocked: () => router.back(),
          }),
      });
    }
    actions.push({ text: t("common.cancel"), style: "cancel" });
    Alert.alert(t("customer.explorePost.moreOptions"), undefined, actions);
  }, [handleShare, openContentReport, post?.id, post?.provider_id, post?.provider?.business_name, postUrl, t, user, confirmBlockUser, router]);

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
  }, [post?.provider?.slug, post?.offering?.id, router]);

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
          <Ionicons name={loadError ? "cloud-offline-outline" : "image-outline"} size={48} color="#D1D5DB" />
          <Text style={{ color: "#6B7280", fontSize: 16, marginTop: 12 }}>
            {loadError ? t("customer.explorePost.loadFailed") : t("customer.explorePost.notFound")}
          </Text>
          <TouchableOpacity
            onPress={loadError ? () => load() : () => router.back()}
            style={{ backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, marginTop: 16 }}
          >
            <Text style={{ color: "#fff", fontWeight: "600" }}>
              {loadError ? t("common.retry") : t("common.back")}
            </Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  const mediaItems = post.media_urls?.length ? post.media_urls : [];
  const providerInitial = (post.provider?.business_name || "B").charAt(0).toUpperCase();

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: "#fff" }}
        behavior="padding"
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
          {mediaItems.length > 0 ? (
            <View style={{ width: screenWidth, backgroundColor: "#F3F4F6" }}>
              <FlatList
                {...horizontalFlatListPerf}
                data={mediaItems}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(e) => setMediaIndex(Math.round(e.nativeEvent.contentOffset.x / screenWidth))}
                keyExtractor={(_, i) => String(i)}
                renderItem={({ item }) =>
                  isExploreVideoUrl(item) ? (
                    <Video
                      source={{ uri: item }}
                      style={{ width: screenWidth, aspectRatio: 4 / 5 }}
                      resizeMode={ResizeMode.COVER}
                      useNativeControls
                      isLooping
                      shouldPlay={false}
                    />
                  ) : (
                    <Image
                      source={{ uri: item }}
                      style={{ width: screenWidth, aspectRatio: 4 / 5 }}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                      transition={200}
                    />
                  )
                }
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

              {/* §UI-audit 2026-04: overlay controls now key off
                  `insets.top` instead of the old hardcoded `top: 52`,
                  which crowded the Dynamic Island on newer iPhones and
                  sat too far down on small Androids. */}
              {/* Back button */}
              <TouchableOpacity
                onPress={() => router.back()}
                style={{
                  position: "absolute",
                  top: insets.top + 8,
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
                  top: insets.top + 8,
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
                  top: insets.top + 8,
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
              {mediaItems.length > 1 && (
                <View style={{ position: "absolute", bottom: 12, alignSelf: "center", backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <Text style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}>{mediaIndex + 1}/{mediaItems.length}</Text>
                </View>
              )}
            </View>
          ) : null}

          {/* Content */}
          <View style={{ padding: contentPadding }}>
            {/* §UI-audit 2026-05: provider row + CTAs previously crammed
                onto a single line, causing the "Book this look" label to
                overflow and clip "View Profile" on small phones. Stack the
                CTAs underneath the provider header so they each get full
                width and never truncate the look name. */}
            <View style={{ marginBottom: 14 }}>
              <Pressable
                onPress={goToProvider}
                style={{ flexDirection: "row", alignItems: "center" }}
                accessibilityRole="button"
                accessibilityLabel={`Open ${post.provider?.business_name || "provider"} profile`}
              >
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    backgroundColor: Colors.primary,
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: 12,
                  }}
                >
                  <Text style={{ color: "#fff", fontSize: 18, fontWeight: "700" }}>{providerInitial}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    style={{ fontSize: 15, fontWeight: "700", color: "#111827" }}
                    numberOfLines={1}
                  >
                    {post.provider?.business_name || "Provider"}
                  </Text>
                  {post.published_at ? (
                    <Text style={{ fontSize: 12, color: "#9CA3AF", marginTop: 2 }}>{formatTime(post.published_at)}</Text>
                  ) : null}
                </View>
              </Pressable>
              {post.provider?.slug ? (
                <View style={{ flexDirection: "row", alignItems: "stretch", gap: 8, marginTop: 12 }}>
                  {post.offering?.id ? (
                    <TouchableOpacity
                      onPress={goToBookThisLook}
                      style={{
                        flex: 1,
                        borderWidth: 1.5,
                        borderColor: Colors.primary,
                        borderRadius: 10,
                        paddingHorizontal: 12,
                        paddingVertical: 9,
                        backgroundColor: Colors.primary,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={t("customer.explorePost.bookThisLook")}
                    >
                      <Text
                        style={{ color: "#fff", fontWeight: "600", fontSize: 13 }}
                        numberOfLines={1}
                      >
                        {t("customer.explorePost.bookThisLook")}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    onPress={goToProvider}
                    style={{
                      flex: 1,
                      borderWidth: 1.5,
                      borderColor: Colors.primary,
                      borderRadius: 10,
                      paddingHorizontal: 12,
                      paddingVertical: 9,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={t("customer.explorePost.viewProfile")}
                  >
                    <Text
                      style={{ color: Colors.primary, fontWeight: "600", fontSize: 13 }}
                      numberOfLines={1}
                    >
                      {t("customer.explorePost.viewProfile")}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>

            {/* §UI-audit 2026-05: action bar previously used fixed
                marginRight: 20 spacers, which left the Share icon orphaned
                far left on phones >=400dp wide and crowded the right edge
                on iPhone SE-class widths. Switch to space-between with
                equal-width hit targets so Like / Comment / Save / Share
                always read as a balanced row regardless of the device. */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 16,
                paddingBottom: 16,
                borderBottomWidth: 1,
                borderColor: "#F3F4F6",
              }}
            >
              {canInteract ? (
              <TouchableOpacity
                onPress={toggleLike}
                disabled={liking}
                style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 4 }}
                accessibilityRole="button"
                accessibilityLabel={t("customer.explorePost.like")}
              >
                <Ionicons
                  name={post.is_liked ? "heart" : "heart-outline"}
                  size={24}
                  color={post.is_liked ? Colors.primary : "#374151"}
                  style={{ marginRight: 6 }}
                />
                <Text
                  style={{ fontSize: 14, fontWeight: "600", color: post.is_liked ? Colors.primary : "#374151" }}
                  numberOfLines={1}
                >
                  {post.like_count > 0 ? post.like_count : t("customer.explorePost.like")}
                </Text>
              </TouchableOpacity>
              ) : null}

              {canInteract ? (
              <TouchableOpacity
                onPress={focusCommentInput}
                style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 4 }}
                accessibilityRole="button"
                accessibilityLabel={t("customer.explorePost.comment")}
              >
                <Ionicons name="chatbubble-outline" size={22} color="#374151" style={{ marginRight: 6 }} />
                <Text
                  style={{ fontSize: 14, fontWeight: "600", color: "#374151" }}
                  numberOfLines={1}
                >
                  {comments.length > 0 ? comments.length : t("customer.explorePost.comment")}
                </Text>
              </TouchableOpacity>
              ) : null}

              {canInteract ? (
              <TouchableOpacity
                onPress={toggleSave}
                disabled={saving}
                style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 4 }}
                accessibilityRole="button"
                accessibilityLabel={t("customer.explorePost.save")}
              >
                <Ionicons
                  name={post.is_saved ? "bookmark" : "bookmark-outline"}
                  size={22}
                  color={post.is_saved ? Colors.primary : "#374151"}
                  style={{ marginRight: 6 }}
                />
                <Text
                  style={{ fontSize: 14, fontWeight: "600", color: post.is_saved ? Colors.primary : "#374151" }}
                  numberOfLines={1}
                >
                  {t("customer.explorePost.save")}
                </Text>
              </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                onPress={handleShare}
                style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 4 }}
                accessibilityRole="button"
                accessibilityLabel={t("customer.explorePost.share")}
              >
                <Ionicons name="paper-plane-outline" size={22} color="#374151" style={{ marginRight: 6 }} />
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#374151" }} numberOfLines={1}>
                  {t("customer.explorePost.share")}
                </Text>
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
                    accessibilityLabel={captionExpanded ? t("common.showLess") : t("common.showMore")}
                    accessibilityRole="button"
                  >
                    <Text style={{ fontSize: 14, color: "#6B7280", fontWeight: "500" }}>
                      {captionExpanded ? t("customer.explorePost.showLess") : t("customer.explorePost.showMore")}
                    </Text>
                  </TouchableOpacity>
                ) : null}
                <Text style={{ fontSize: 12, color: "#9CA3AF", lineHeight: 18, marginTop: 8, fontStyle: "italic" }}>
                  {t("customer.explorePost.medicalDisclaimer")}
                </Text>
              </View>
            ) : null}

            {/* Comments */}
            <Text style={{ fontSize: 16, fontWeight: "700", color: "#111827", marginBottom: 4 }}>
              {t("customer.explorePost.commentsTitle")} {comments.length > 0 ? `(${comments.length})` : ""}
            </Text>
            {user && comments.length > 0 ? (
              <Text style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 12 }}>
                {t("customer.explorePost.reportCommentHint")}
              </Text>
            ) : null}

            {comments.length === 0 ? (
              <View style={{ paddingVertical: 20, alignItems: "center" }}>
                <Ionicons name="chatbubbles-outline" size={28} color="#D1D5DB" />
                <Text style={{ fontSize: 13, color: "#9CA3AF", marginTop: 8 }}>
                  {canInteract ? t("customer.explorePost.noCommentsYet") : t("customer.explorePost.safetyInteractionsOff")}
                </Text>
              </View>
            ) : (
              comments.map((c) => {
                const initial = (c.author?.full_name || "U").charAt(0).toUpperCase();
                return (
                  <Pressable
                    key={c.id}
                    onLongPress={() => openContentReport("explore_comment", c.id, t("customer.contentReport.reportComment"))}
                    delayLongPress={400}
                    style={{ flexDirection: "row", paddingVertical: 10, borderBottomWidth: 1, borderColor: "#F9FAFB" }}
                  >
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
                    {user ? (
                      <TouchableOpacity
                        onPress={() => openContentReport("explore_comment", c.id, t("customer.contentReport.reportComment"))}
                        style={{ paddingLeft: 8, paddingVertical: 4 }}
                        accessibilityRole="button"
                        accessibilityLabel={t("customer.contentReport.reportComment")}
                      >
                        <Ionicons name="flag-outline" size={16} color="#9CA3AF" />
                      </TouchableOpacity>
                    ) : null}
                  </Pressable>
                );
              })
            )}

            {/* More like this */}
            {relatedPosts.length > 0 ? (
              <View style={{ marginTop: 24, marginBottom: 16 }}>
                <Text style={{ fontSize: 16, fontWeight: "700", color: "#111827", marginBottom: 12 }}>
                  {t("customer.explorePost.moreLikeThis")}
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

        {/* §UI-audit 2026-05: composer used a hardcoded 30dp bottom pad
            on iOS that ignored the actual home indicator height — on
            iPhone 15 Pro Max the bar floated over the indicator while
            iPhone SE wasted space. Use `insets.bottom` so the bar hugs
            the keyboard / indicator on every device, and pad
            non-iOS bottoms by 10dp to keep tap targets accessible. */}
        {/* Comment input bar */}
        {user && canInteract ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: contentPadding,
              paddingVertical: 10,
              paddingBottom: 10 + (Platform.OS === "ios" ? insets.bottom : 0),
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
              placeholder={t("customer.explorePost.addComment")}
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
        ) : user && !canInteract ? (
          <View
            style={{
              paddingHorizontal: contentPadding,
              paddingVertical: 14,
              paddingBottom: 14 + (Platform.OS === "ios" ? insets.bottom : 0),
              borderTopWidth: 1,
              borderColor: "#F3F4F6",
              backgroundColor: "#F9FAFB",
              alignItems: "center",
            }}
          >
            <Text style={{ color: "#6B7280", fontWeight: "500", fontSize: 14, textAlign: "center", lineHeight: 20 }}>
              {t("customer.explorePost.safetyInteractionsOff")}
            </Text>
          </View>
        ) : (
          <Pressable
            onPress={() => pushCustomerLogin(explorePostReturnTo)}
            style={{
              paddingHorizontal: contentPadding,
              paddingVertical: 14,
              paddingBottom: 14 + (Platform.OS === "ios" ? insets.bottom : 0),
              borderTopWidth: 1,
              borderColor: "#F3F4F6",
              backgroundColor: "#fff",
              alignItems: "center",
            }}
          >
            <Text style={{ color: Colors.primary, fontWeight: "600", fontSize: 14 }}>
              {t("customer.explorePost.signInPromptTitle")}
            </Text>
          </Pressable>
        )}
      </KeyboardAvoidingView>

      {reportTarget ? (
        <ContentReportSheet
          visible
          onClose={() => setReportTarget(null)}
          targetType={reportTarget.type}
          targetId={reportTarget.id}
          title={reportTarget.title}
        />
      ) : null}
    </>
  );
}
