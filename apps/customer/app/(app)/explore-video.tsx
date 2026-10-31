import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  Animated,
  Platform,
  Alert,
  TextInput,
  useWindowDimensions,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useVideoPlayer, VideoView } from "expo-video";
import { ExploreTextOverlayLayer } from "@/components/explore/ExploreTextOverlayLayer";
import {
  filterOverlaysForPlaybackTime,
  shouldDrawVideoTextOverlays,
} from "@/lib/explore-overlay-playback";
import { useAuth } from "@/providers/AuthProvider";
import { api } from "@/lib/api-client";
import { Colors } from "@/constants/colors";
import { haptic } from "@/lib/haptics";
import { verticalFlatListPerf } from "@/lib/flatListPerformance";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { useTranslation } from "@beautonomi/i18n";
import { pushCustomerLogin } from "@/lib/guest-browse-policy";
import { BottomSheet } from "@/components/ui/BottomSheet";
import type { ExploreComment, ExplorePost } from "@/types/api";
import {
  firstSlideIsVideo,
  resolveExploreVideoSrc,
} from "@/lib/explore-media";
import { trackExploreView, trackExploreWatchProgress } from "@/lib/explore-analytics";
import { DirectionalIcon } from "@/components/ui/DirectionalIcon";
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import { useUserBlocks } from "@/hooks/useUserBlocks";
import {
  ContentReportSheet,
  type ContentReportTargetType,
} from "@/components/safety/ContentReportSheet";

function ExploreSoundBed({
  soundUrl,
  active,
  muted,
}: {
  soundUrl: string;
  active: boolean;
  muted: boolean;
}) {
  const playerRef = useRef<ReturnType<typeof createAudioPlayer> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await setAudioModeAsync({ playsInSilentMode: true });
      if (cancelled) return;
      const player = createAudioPlayer({ uri: soundUrl });
      player.loop = true;
      playerRef.current = player;
      if (active && !muted) player.play();
    })();
    return () => {
      cancelled = true;
      playerRef.current?.remove();
      playerRef.current = null;
    };
  }, [soundUrl]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    if (active && !muted) player.play();
    else player.pause();
  }, [active, muted]);

  return null;
}

function ExploreVideoPlayer({
  post,
  active,
  muted,
}: {
  post: ExplorePost;
  active: boolean;
  muted: boolean;
}) {
  const useSoundTrack = Boolean(post.sound_url);
  const effectiveMuted = muted || useSoundTrack;
  const uri =
    resolveExploreVideoSrc({
      mediaUrls: post.media_urls ?? [],
      playbackPath: post.playback_path,
      mediaMeta: post.media_meta,
    }) ?? post.media_urls?.[0] ?? "";
  const [progress, setProgress] = useState(0);
  const [playbackTimeMs, setPlaybackTimeMs] = useState(0);
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = effectiveMuted;
    if (!active) p.pause();
    else p.play();
  });

  useEffect(() => {
    player.muted = effectiveMuted;
    if (active) {
      player.play();
      void trackExploreView(post.id);
    } else {
      player.pause();
      void trackExploreWatchProgress(post.id, Math.floor((player.currentTime || 0) * 1000));
    }
  }, [active, effectiveMuted, player, post.id]);

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      const t = player.currentTime || 0;
      setPlaybackTimeMs(Math.floor(t * 1000));
      const duration = player.duration || 0;
      if (duration > 0) setProgress(Math.min(1, t / duration));
    }, 200);
    return () => clearInterval(timer);
  }, [active, player]);

  const slide0 = post.media_meta?.[0];
  const drawOverlays = shouldDrawVideoTextOverlays(slide0);
  const visibleOverlays = drawOverlays
    ? filterOverlaysForPlaybackTime(slide0?.text_overlays, playbackTimeMs)
    : [];

  return (
    <View style={{ flex: 1 }}>
      {post.sound_url ? (
        <ExploreSoundBed soundUrl={post.sound_url} active={active} muted={muted} />
      ) : null}
      <VideoView
        player={player}
        style={{ flex: 1, backgroundColor: "#000" }}
        contentFit="cover"
        nativeControls={false}
      />
      {drawOverlays ? <ExploreTextOverlayLayer overlays={visibleOverlays} /> : null}
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 3,
          backgroundColor: "rgba(255,255,255,0.25)",
        }}
      >
        <View style={{ width: `${progress * 100}%`, height: "100%", backgroundColor: Colors.primary }} />
      </View>
    </View>
  );
}

function VideoFeedItem({
  post,
  active,
  screenHeight,
  muted,
  onToggleMute,
  onLike,
  onSave,
  onOpenComments,
  onShare,
  onMorePress,
}: {
  post: ExplorePost;
  active: boolean;
  screenHeight: number;
  muted: boolean;
  onToggleMute: () => void;
  onLike: () => void;
  onSave: () => void;
  onOpenComments: () => void;
  onShare: () => void;
  onMorePress: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const heartAnim = useRef(new Animated.Value(0)).current;
  const lastTap = useRef(0);
  const useNativeDriver = Platform.OS !== "web";

  const handlePress = useCallback(() => {
    const now = Date.now();
    if (now - lastTap.current < 280) {
      onLike();
      Animated.sequence([
        Animated.spring(heartAnim, { toValue: 1, useNativeDriver, speed: 20, bounciness: 12 }),
        Animated.timing(heartAnim, { toValue: 0, duration: 600, useNativeDriver, delay: 400 }),
      ]).start();
    }
    lastTap.current = now;
  }, [heartAnim, onLike, useNativeDriver]);

  const providerName = post.provider?.business_name || t("customer.explorePost.providerFallback");

  return (
    <Pressable style={{ height: screenHeight, backgroundColor: "#000" }} onPress={handlePress}>
      <ExploreVideoPlayer post={post} active={active} muted={muted} />
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          inset: 0,
          alignItems: "center",
          justifyContent: "center",
          opacity: heartAnim,
          transform: [{ scale: heartAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.3] }) }],
        }}
      >
        <Ionicons name="heart" size={72} color="#fff" />
      </Animated.View>

      <View
        style={{
          position: "absolute",
          top: insets.top + 12,
          right: 16,
          flexDirection: "row",
          gap: 8,
        }}
      >
        <TouchableOpacity
          onPress={onMorePress}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: "rgba(0,0,0,0.45)",
            alignItems: "center",
            justifyContent: "center",
          }}
          accessibilityRole="button"
          accessibilityLabel={t("customer.explorePost.moreOptions")}
        >
          <Ionicons name="ellipsis-horizontal" size={20} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onToggleMute}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: "rgba(0,0,0,0.45)",
            alignItems: "center",
            justifyContent: "center",
          }}
          accessibilityRole="button"
          accessibilityLabel={muted ? t("customer.exploreVideo.unmute") : t("customer.exploreVideo.mute")}
        >
          <Ionicons name={muted ? "volume-mute" : "volume-high"} size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      <View
        style={{
          position: "absolute",
          right: 12,
          bottom: insets.bottom + 96,
          alignItems: "center",
          gap: 18,
        }}
      >
        <TouchableOpacity onPress={onLike} accessibilityRole="button" accessibilityLabel={t("customer.explorePost.like")}>
          <Ionicons name={post.is_liked ? "heart" : "heart-outline"} size={30} color={post.is_liked ? Colors.primary : "#fff"} />
          <Text style={{ color: "#fff", fontSize: 12, textAlign: "center", marginTop: 4 }}>{post.like_count || ""}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onOpenComments} accessibilityRole="button" accessibilityLabel={t("customer.explorePost.comment")}>
          <Ionicons name="chatbubble-outline" size={28} color="#fff" />
          <Text style={{ color: "#fff", fontSize: 12, textAlign: "center", marginTop: 4 }}>{post.comment_count || ""}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onSave} accessibilityRole="button" accessibilityLabel={t("customer.explorePost.save")}>
          <Ionicons name={post.is_saved ? "bookmark" : "bookmark-outline"} size={28} color={post.is_saved ? Colors.primary : "#fff"} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onShare} accessibilityRole="button" accessibilityLabel={t("customer.explorePost.share")}>
          <Ionicons name="paper-plane-outline" size={26} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={{ position: "absolute", left: 16, right: 72, bottom: insets.bottom + 24 }}>
        <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15, marginBottom: 6 }}>{providerName}</Text>
        {post.caption ? (
          <Text style={{ color: "#fff", fontSize: 14, lineHeight: 20 }} numberOfLines={3}>
            {post.caption}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export default function ExploreVideoScreen() {
  useScreenTracking("Explore Video");
  const { id, feedSort, lat, lng, cursor } = useLocalSearchParams<{
    id: string;
    feedSort?: string;
    lat?: string;
    lng?: string;
    cursor?: string;
  }>();
  const router = useRouter();
  const { height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { t } = useTranslation();
  const { confirmBlockUser } = useUserBlocks();

  const [posts, setPosts] = useState<ExplorePost[]>([]);
  const [reportTarget, setReportTarget] = useState<{
    type: ContentReportTargetType;
    id: string;
    title?: string;
  } | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [muted, setMuted] = useState(true);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<ExploreComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentInput, setCommentInput] = useState("");
  const [commentSending, setCommentSending] = useState(false);
  const [replyToCommentId, setReplyToCommentId] = useState<string | null>(null);

  const activePost = posts[activeIndex];

  const videoReturnTo = id
    ? `/(app)/explore-video?id=${encodeURIComponent(id)}`
    : "/(app)/(tabs)/explore";

  const openContentReport = useCallback(
    (type: ContentReportTargetType, targetId: string, title?: string) => {
      if (!user) {
        Alert.alert(
          t("customer.contentReport.signInTitle"),
          t("customer.contentReport.signInBody"),
          [
            { text: t("common.cancel"), style: "cancel" },
            { text: t("auth.login"), onPress: () => pushCustomerLogin(videoReturnTo) },
          ],
        );
        return;
      }
      haptic.light();
      setReportTarget({ type, id: targetId, title });
    },
    [t, user, videoReturnTo],
  );

  const dropPostsByProvider = useCallback((providerId: string) => {
    setPosts((prev) => {
      const next = prev.filter((p) => p.provider_id !== providerId);
      setActiveIndex((idx) => Math.min(idx, Math.max(0, next.length - 1)));
      return next;
    });
  }, []);

  const showMoreOptions = useCallback(() => {
    const post = posts[activeIndex];
    if (!post) return;
    haptic.light();
    const actions: Array<{ text: string; onPress?: () => void; style?: "cancel" | "destructive" }> = [];
    if (user && post.id) {
      actions.push({
        text: t("customer.contentReport.reportPost"),
        style: "destructive",
        onPress: () =>
          openContentReport("explore_post", post.id, t("customer.contentReport.reportPost")),
      });
    }
    if (user && post.provider_id) {
      actions.push({
        text: t("customer.blockUser.confirmAction"),
        style: "destructive",
        onPress: () =>
          confirmBlockUser({
            providerId: post.provider_id,
            displayName: post.provider?.business_name,
            onBlocked: () => dropPostsByProvider(post.provider_id!),
          }),
      });
    }
    actions.push({ text: t("common.cancel"), style: "cancel" });
    Alert.alert(t("customer.explorePost.moreOptions"), undefined, actions);
  }, [activeIndex, confirmBlockUser, dropPostsByProvider, openContentReport, posts, t, user]);

  const loadFeed = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "30" });
      if (feedSort) params.set("sort", feedSort);
      if (feedSort === "nearby" && lat && lng) {
        params.set("lat", lat);
        params.set("lng", lng);
        params.set("radius_km", "50");
      }
      if (cursor) params.set("cursor", cursor);
      const [singleRes, listRes] = await Promise.all([
        api.get<ExplorePost>(`/api/explore/posts/${id}`),
        api.get<ExplorePost[] | { data?: ExplorePost[] }>(`/api/explore/posts?${params.toString()}`),
      ]);
      const singleBody = singleRes.data as ExplorePost | { data?: ExplorePost } | undefined;
      const single = (singleBody as { data?: ExplorePost })?.data ?? (singleBody as ExplorePost);
      const listBody = listRes.data as ExplorePost[] | { data?: ExplorePost[] } | undefined;
      const list = Array.isArray(listBody) ? listBody : listBody?.data ?? [];
      const videoPosts = list.filter((p) => firstSlideIsVideo(p.media_urls, p.media_meta));
      const merged = [...videoPosts];
      if (single?.id && !merged.some((p) => p.id === single.id)) {
        merged.unshift(single);
      }
      const start = Math.max(0, merged.findIndex((p) => p.id === id));
      setPosts(merged);
      setActiveIndex(start >= 0 ? start : 0);
    } finally {
      setLoading(false);
    }
  }, [id, feedSort, lat, lng, cursor]);

  useEffect(() => {
    void loadFeed();
  }, [loadFeed]);

  const onMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = Math.round(e.nativeEvent.contentOffset.y / screenHeight);
      if (next !== activeIndex) setActiveIndex(next);
    },
    [activeIndex, screenHeight],
  );

  const patchPost = useCallback((postId: string, patch: Partial<ExplorePost>) => {
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, ...patch } : p)));
  }, []);

  const toggleLike = useCallback(async () => {
    const post = posts[activeIndex];
    if (!post) return;
    if (!user) {
      pushCustomerLogin(`/(app)/explore-video?id=${encodeURIComponent(post.id)}`);
      return;
    }
    haptic.light();
    const prevLiked = post.is_liked;
    const prevCount = post.like_count;
    patchPost(post.id, {
      is_liked: !prevLiked,
      like_count: prevLiked ? Math.max(0, prevCount - 1) : prevCount + 1,
    });
    const res = prevLiked
      ? await api.delete(`/api/explore/events?post_id=${post.id}&event_type=like`)
      : await api.post("/api/explore/events", {
          post_id: post.id,
          event_type: "like",
          idempotency_key: `like-${post.id}-${user.id}-${Date.now()}`,
        });
    if (res.error) {
      patchPost(post.id, { is_liked: prevLiked, like_count: prevCount });
    }
  }, [activeIndex, patchPost, posts, user]);

  const toggleSave = useCallback(async () => {
    const post = posts[activeIndex];
    if (!post || !user) {
      if (post) pushCustomerLogin(`/(app)/explore-video?id=${encodeURIComponent(post.id)}`);
      return;
    }
    haptic.light();
    const wasSaved = post.is_saved;
    patchPost(post.id, { is_saved: !wasSaved });
    const res = wasSaved
      ? await api.delete(`/api/explore/saved?post_id=${post.id}`)
      : await api.post("/api/explore/saved", { post_id: post.id });
    if (res.error) patchPost(post.id, { is_saved: wasSaved });
  }, [activeIndex, patchPost, posts, user]);

  const closeComments = useCallback(() => {
    setCommentsOpen(false);
    setReplyToCommentId(null);
    setCommentInput("");
  }, []);

  const openComments = useCallback(async () => {
    const post = posts[activeIndex];
    if (!post) return;
    setReplyToCommentId(null);
    setCommentInput("");
    setCommentsOpen(true);
    setCommentsLoading(true);
    try {
      const res = await api.get<ExploreComment[]>(`/api/explore/posts/${post.id}/comments`);
      const raw = res.data as ExploreComment[] | { data?: ExploreComment[] } | undefined;
      const list = Array.isArray(raw) ? raw : raw?.data ?? [];
      setComments(list);
    } finally {
      setCommentsLoading(false);
    }
  }, [activeIndex, posts]);

  const sendComment = useCallback(async () => {
    const post = posts[activeIndex];
    const text = commentInput.trim();
    if (!post || !text || !user || commentSending) return;
    setCommentSending(true);
    const parentId = replyToCommentId;
    setCommentInput("");
    try {
      const res = await api.post<ExploreComment>(`/api/explore/posts/${post.id}/comments`, {
        body: text,
        ...(parentId ? { parent_id: parentId } : {}),
      });
      if (res.error) {
        setCommentInput(text);
        Alert.alert(t("common.error"), t("customer.explorePost.errorPostComment"));
        return;
      }
      const created = (res.data as { data?: ExploreComment })?.data ?? (res.data as ExploreComment);
      if (created) {
        const normalized = {
          ...created,
          body: created.body ?? text,
          author: created.author ?? { full_name: user.user_metadata?.full_name },
          replies: created.replies ?? [],
        };
        if (parentId) {
          setComments((prev) =>
            prev.map((c) =>
              c.id === parentId ? { ...c, replies: [...(c.replies ?? []), normalized] } : c,
            ),
          );
        } else {
          setComments((prev) => [...prev, normalized]);
        }
        setReplyToCommentId(null);
        patchPost(post.id, { comment_count: (post.comment_count ?? 0) + 1 });
      }
    } catch {
      setCommentInput(text);
      Alert.alert(t("common.error"), t("customer.explorePost.errorPostComment"));
    } finally {
      setCommentSending(false);
    }
  }, [activeIndex, commentInput, commentSending, patchPost, posts, replyToCommentId, t, user]);

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<ExplorePost>) => (
      <VideoFeedItem
        post={item}
        active={index === activeIndex}
        screenHeight={screenHeight}
        muted={muted}
        onToggleMute={() => setMuted((m) => !m)}
        onLike={toggleLike}
        onSave={toggleSave}
        onOpenComments={openComments}
        onShare={() => Alert.alert(t("customer.explorePost.share"))}
        onMorePress={showMoreOptions}
      />
    ),
    [activeIndex, muted, openComments, screenHeight, showMoreOptions, t, toggleLike, toggleSave],
  );

  if (loading && !posts.length) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color="#fff" size="large" />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        <FlatList
          {...verticalFlatListPerf}
          data={posts}
          keyExtractor={(p) => p.id}
          renderItem={renderItem}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          snapToInterval={screenHeight}
          decelerationRate="fast"
          onMomentumScrollEnd={onMomentumScrollEnd}
          getItemLayout={(_, index) => ({ length: screenHeight, offset: screenHeight * index, index })}
          initialScrollIndex={activeIndex > 0 ? activeIndex : undefined}
        />
        <TouchableOpacity
          onPress={() => router.back()}
          style={{
            position: "absolute",
            top: insets.top + 12,
            left: 16,
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: "rgba(0,0,0,0.45)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <DirectionalIcon name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <BottomSheet visible={commentsOpen} onClose={closeComments} title={t("customer.explorePost.commentsTitle")}>
        {commentsLoading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginVertical: 16 }} />
        ) : (
          comments.map((c) => (
            <View key={c.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderColor: "#f3f4f6" }}>
              <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: "600", fontSize: 13 }}>{c.author?.full_name || t("customer.explorePost.userFallback")}</Text>
                  <Text style={{ fontSize: 14, color: "#374151", marginTop: 2 }}>{c.body}</Text>
                  {user ? (
                    <TouchableOpacity onPress={() => setReplyToCommentId(c.id)} style={{ marginTop: 4 }}>
                      <Text style={{ fontSize: 12, fontWeight: "600", color: Colors.gray[500] }}>
                        {t("customer.explorePost.reply")}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                {user ? (
                  <TouchableOpacity
                    onPress={() =>
                      openContentReport("explore_comment", c.id, t("customer.contentReport.reportComment"))
                    }
                    accessibilityRole="button"
                    accessibilityLabel={t("customer.contentReport.reportComment")}
                    style={{ paddingStart: 8 }}
                  >
                    <Ionicons name="flag-outline" size={16} color="#9CA3AF" />
                  </TouchableOpacity>
                ) : null}
              </View>
              {(c.replies ?? []).map((r) => (
                <View
                  key={r.id}
                  style={{
                    marginTop: 8,
                    marginStart: 16,
                    paddingStart: 8,
                    borderStartWidth: 2,
                    borderColor: "#e5e7eb",
                    flexDirection: "row",
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: "600", fontSize: 12 }}>{r.author?.full_name || t("customer.explorePost.userFallback")}</Text>
                    <Text style={{ fontSize: 13, color: "#374151", marginTop: 2 }}>{r.body}</Text>
                  </View>
                  {user ? (
                    <TouchableOpacity
                      onPress={() =>
                        openContentReport("explore_comment", r.id, t("customer.contentReport.reportComment"))
                      }
                      accessibilityRole="button"
                      accessibilityLabel={t("customer.contentReport.reportComment")}
                      style={{ paddingStart: 8 }}
                    >
                      <Ionicons name="flag-outline" size={14} color="#9CA3AF" />
                    </TouchableOpacity>
                  ) : null}
                </View>
              ))}
            </View>
          ))
        )}
        {user ? (
          <View style={{ marginTop: 12 }}>
            {replyToCommentId ? (
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <Text style={{ fontSize: 12, color: Colors.gray[600] }}>{t("customer.explorePost.replying")}</Text>
                <TouchableOpacity onPress={() => setReplyToCommentId(null)} accessibilityRole="button">
                  <Text style={{ fontSize: 12, fontWeight: "600", color: Colors.primary }}>{t("common.cancel")}</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <TextInput
              style={{
                flex: 1,
                backgroundColor: "#F3F4F6",
                borderRadius: 999,
                paddingHorizontal: 14,
                paddingVertical: 8,
                fontSize: 14,
              }}
              placeholder={
                replyToCommentId
                  ? t("customer.explorePost.replyPlaceholder")
                  : t("customer.explorePost.addComment")
              }
              value={commentInput}
              onChangeText={setCommentInput}
            />
            <TouchableOpacity
              onPress={sendComment}
              disabled={!commentInput.trim() || commentSending}
            >
              <Ionicons name="send" size={22} color={Colors.primary} />
            </TouchableOpacity>
            </View>
          </View>
        ) : null}
      </BottomSheet>

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
