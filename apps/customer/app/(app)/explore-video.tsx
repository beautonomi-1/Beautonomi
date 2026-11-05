import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { APP_URL } from "@/config/public-env";
import {
  copyExplorePostLink,
  presentExplorePostShareActions,
  shareExplorePostLink,
  shareExplorePostMedia,
  type ExploreShareAction,
} from "@/lib/share-explore-post";
import { getExploreVideoPlaybackTrimWindow } from "@/lib/explore-video-playback-trim";
import { useExploreTrimLoop } from "@/hooks/useExploreTrimLoop";
import {
  appendExploreCommentPage,
  nextOffsetAfterEmptyCommentPage,
  appendExploreReelVideos,
  exploreClipWatchedMs,
  placeExploreComment,
  preserveReelEngagement,
  reelHasAnotherPage,
  pendingReelAdvanceStillApplies,
  shouldAdvanceExploreReel,
  shouldCompleteExploreReelClip,
} from "@/lib/explore-reel-feed";
import {
  ExploreVideoReelEndMark,
  ExploreVideoReelSideLogo,
} from "@/components/explore/ExploreVideoReelBrand";
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
  const activeRef = useRef(active);
  const mutedRef = useRef(muted);
  activeRef.current = active;
  mutedRef.current = muted;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await setAudioModeAsync({ playsInSilentMode: true });
      if (cancelled) return;
      const player = createAudioPlayer({ uri: soundUrl });
      const playing = activeRef.current && !mutedRef.current;
      player.loop = playing;
      playerRef.current = player;
      if (playing) player.play();
      else player.pause();
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
    const playing = active && !muted;
    player.loop = playing;
    if (playing) player.play();
    else player.pause();
  }, [active, muted]);

  return null;
}

function ExploreVideoPlayer({
  post,
  active,
  muted,
  onReelEnd,
  onPlayingChange,
}: {
  post: ExplorePost;
  active: boolean;
  muted: boolean;
  onReelEnd?: () => void;
  onPlayingChange?: (playing: boolean) => void;
}) {
  const useSoundTrack = Boolean(post.sound_url);
  const effectiveMuted = muted || useSoundTrack;
  const slide0 = post.media_meta?.[0];
  const trimWindow = getExploreVideoPlaybackTrimWindow({
    slide: slide0,
    mediaUrl: post.media_urls?.[0],
    slideIndex: 0,
    postPlaybackPath: post.playback_path,
  });
  const trimStartMs = trimWindow?.trim_start_ms ?? null;
  const trimEndMs = trimWindow?.trim_end_ms ?? null;
  const uri =
    resolveExploreVideoSrc({
      mediaUrls: post.media_urls ?? [],
      playbackPath: trimWindow ? null : post.playback_path,
      mediaMeta: trimWindow ? null : post.media_meta,
    }) ?? post.media_urls?.[0] ?? "";
  const [progress, setProgress] = useState(0);
  const [playbackTimeMs, setPlaybackTimeMs] = useState(0);
  const [clipEnded, setClipEnded] = useState(false);
  const reelEndFiredRef = useRef(false);
  const playedIntoClipRef = useRef(false);
  const playedActiveRef = useRef(false);
  const playingPostIdRef = useRef<string | null>(null);
  const wasActiveRef = useRef(active);
  const player = useVideoPlayer(uri, (p) => {
    p.loop = onReelEnd ? false : trimStartMs == null;
    p.muted = effectiveMuted;
    if (!active) p.pause();
    else p.play();
  });

  useEffect(() => {
    reelEndFiredRef.current = false;
    playedIntoClipRef.current = false;
  }, [post.id, active]);

  const handleReelEnd = useCallback(() => {
    if (!onReelEnd) return;
    if (
      !shouldCompleteExploreReelClip({
        active,
        seeking: false,
        playedInside: playedIntoClipRef.current,
        alreadyCompleted: reelEndFiredRef.current,
      })
    ) {
      return;
    }
    reelEndFiredRef.current = true;
    setClipEnded(true);
    const watched = exploreClipWatchedMs(player.currentTime || 0, trimStartMs, trimEndMs);
    if (watched > 0) void trackExploreWatchProgress(post.id, watched);
    onReelEnd?.();
  }, [active, onReelEnd, player, post.id, trimEndMs, trimStartMs]);

  useExploreTrimLoop(
    player,
    trimStartMs,
    trimEndMs,
    active,
    onReelEnd
      ? {
          onTrimEnd: () => {
            // The trim hook already required an interior sample. The 200ms progress
            // sampler can miss that window and would otherwise drop the advance.
            playedIntoClipRef.current = true;
            handleReelEnd();
          },
        }
      : undefined,
  );

  useEffect(() => {
    if (!active || !onReelEnd) return;
    const sub = player.addListener("playToEnd", () => handleReelEnd());
    return () => sub.remove();
  }, [active, handleReelEnd, onReelEnd, player]);

  useEffect(() => {
    player.muted = !active || effectiveMuted;
  }, [active, effectiveMuted, player]);

  useEffect(() => {
    if (active && !wasActiveRef.current) setClipEnded(false);
    wasActiveRef.current = active;
  }, [active]);

  useEffect(() => {
    if (!active) {
      player.pause();
      return;
    }
    playingPostIdRef.current = post.id;
    playedActiveRef.current = true;
    if (trimStartMs != null) {
      const target = trimStartMs / 1000;
      if (Math.abs((player.currentTime || 0) - target) > 0.05) player.currentTime = target;
    } else if ((player.duration || 0) > 0 && (player.currentTime || 0) >= player.duration - 0.1) {
      player.currentTime = 0;
    }
    if (!reelEndFiredRef.current) player.play();
    void trackExploreView(post.id);
    return () => {
      const playedId = playingPostIdRef.current;
      playingPostIdRef.current = null;
      if (!playedActiveRef.current || playedId !== post.id) {
        playedActiveRef.current = false;
        return;
      }
      playedActiveRef.current = false;
      const watched = exploreClipWatchedMs(player.currentTime || 0, trimStartMs, trimEndMs);
      if (watched > 0 && playedId) void trackExploreWatchProgress(playedId, watched);
    };
  }, [active, player, post.id, trimEndMs, trimStartMs]);

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      onPlayingChange?.(Boolean(player.playing));
      const t = player.currentTime || 0;
      if (trimStartMs == null && t > 0.25) playedIntoClipRef.current = true;
      if (trimStartMs != null && trimEndMs != null) {
        const rel = Math.max(0, t * 1000 - trimStartMs);
        const len = trimEndMs - trimStartMs;
        if (rel > 200 && rel < len - 80) playedIntoClipRef.current = true;
      }
      if (trimStartMs != null && trimEndMs != null) {
        const lenMs = trimEndMs - trimStartMs;
        const relMs = Math.max(0, Math.floor(t * 1000) - trimStartMs);
        setPlaybackTimeMs(relMs);
        if (lenMs > 0) setProgress(Math.min(1, relMs / lenMs));
        return;
      }
      setPlaybackTimeMs(Math.floor(t * 1000));
      const duration = player.duration || 0;
      if (duration > 0) setProgress(Math.min(1, t / duration));
    }, 200);
    return () => clearInterval(timer);
  }, [active, onPlayingChange, player, trimStartMs, trimEndMs]);

  const drawOverlays = shouldDrawVideoTextOverlays(slide0);
  const visibleOverlays = drawOverlays
    ? filterOverlaysForPlaybackTime(slide0?.text_overlays, playbackTimeMs)
    : [];
  const clipDurationMs =
    trimStartMs != null && trimEndMs != null
      ? trimEndMs - trimStartMs
      : Math.max(0, Math.floor((player.duration || 0) * 1000));

  return (
    <View style={{ flex: 1 }}>
      {post.sound_url ? (
        <ExploreSoundBed soundUrl={post.sound_url} active={active} muted={muted || clipEnded} />
      ) : null}
      <VideoView
        player={player}
        style={{ flex: 1, backgroundColor: "#000" }}
        contentFit="cover"
        nativeControls={false}
      />
      {drawOverlays ? <ExploreTextOverlayLayer overlays={visibleOverlays} /> : null}
      {onReelEnd ? <ExploreVideoReelEndMark progress={progress} durationMs={clipDurationMs} /> : null}
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
  onReelEnd,
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
  onReelEnd?: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const heartAnim = useRef(new Animated.Value(0)).current;
  const lastTap = useRef(0);
  const useNativeDriver = Platform.OS !== "web";
  const [clipPlaying, setClipPlaying] = useState(false);

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
      <ExploreVideoPlayer
        post={post}
        active={active}
        muted={muted}
        onReelEnd={onReelEnd}
        onPlayingChange={active ? setClipPlaying : undefined}
      />
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
        <ExploreVideoReelSideLogo spinning={active && clipPlaying} style={{ marginTop: 4 }} />
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
  const { id, feedSort, lat, lng, cursor, feedCategory, feedSearch, feedTags } = useLocalSearchParams<{
    id: string;
    feedSort?: string;
    lat?: string;
    lng?: string;
    cursor?: string;
    feedCategory?: string;
    feedSearch?: string;
    feedTags?: string;
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
  const [commentsOffset, setCommentsOffset] = useState(0);
  const [hasMoreComments, setHasMoreComments] = useState(false);
  const [commentInput, setCommentInput] = useState("");
  const [commentSending, setCommentSending] = useState(false);
  const [replyToCommentId, setReplyToCommentId] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [hasMoreFeed, setHasMoreFeed] = useState(true);
  const [listDragging, setListDragging] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const listRef = useRef<FlatList<ExplorePost>>(null);
  const postsRef = useRef(posts);
  const feedRequestRef = useRef(0);
  const commentsRequestRef = useRef(0);
  postsRef.current = posts;
  const appendInFlightRef = useRef(false);
  const pendingEndRef = useRef(false);
  const pendingEndPostIdRef = useRef<string | null>(null);
  const dragClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastOffsetRef = useRef(0);

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
    const next = posts.filter((p) => p.provider_id !== providerId);
    setCommentsOpen(false);
    setShareOpen(false);
    setMenuOpen(false);
    setReportTarget(null);
    pendingEndRef.current = false;
    pendingEndPostIdRef.current = null;
    setPosts(next);
    if (next.length === 0) {
      router.back();
      return;
    }
    const nextIndex = Math.min(activeIndex, next.length - 1);
    setActiveIndex(nextIndex);
    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ index: nextIndex, animated: false });
    });
  }, [activeIndex, posts, router]);

  const showMoreOptions = useCallback(() => {
    const post = posts[activeIndex];
    if (!post) return;
    haptic.light();
    setMenuOpen(true);
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
    Alert.alert(
      t("customer.explorePost.moreOptions"),
      undefined,
      actions.map((action) => ({
        text: action.text,
        style: action.style,
        onPress: () => {
          setMenuOpen(false);
          action.onPress?.();
        },
      })),
      { cancelable: true, onDismiss: () => setMenuOpen(false) },
    );
  }, [activeIndex, confirmBlockUser, dropPostsByProvider, openContentReport, posts, t, user]);

  const buildFeedParams = useCallback(
    (pageCursor?: string) => {
      const params = new URLSearchParams({ limit: "30" });
      if (feedSort) params.set("sort", feedSort);
      if (feedSort === "nearby" && lat && lng) {
        params.set("lat", lat);
        params.set("lng", lng);
        params.set("radius_km", "50");
      }
      if (feedCategory && feedCategory !== "all") params.set("category", feedCategory);
      if (feedSearch?.trim()) params.set("search", feedSearch.trim());
      if (feedTags?.trim()) params.set("tags", feedTags.trim());
      const c = pageCursor ?? cursor;
      if (c) params.set("cursor", c);
      return params;
    },
    [cursor, feedCategory, feedSearch, feedSort, feedTags, lat, lng],
  );

  const parseFeedList = useCallback((listBody: unknown) => {
    const body = listBody as
      | ExplorePost[]
      | { data?: ExplorePost[]; posts?: ExplorePost[]; next_cursor?: string; has_more?: boolean }
      | undefined;
    if (Array.isArray(body)) {
      return { items: body, next: undefined as string | undefined, more: false };
    }
    const items = body?.data ?? body?.posts ?? [];
    return { items, next: body?.next_cursor, more: body?.has_more ?? false };
  }, []);

  const mergeVideoPosts = useCallback((list: ExplorePost[], single?: ExplorePost | null) => {
    const videoPosts = list.filter((p) => firstSlideIsVideo(p.media_urls, p.media_meta));
    const merged = [...videoPosts];
    if (single?.id && !merged.some((p) => p.id === single.id)) {
      merged.unshift(single);
    }
    return merged;
  }, []);

  const loadFeed = useCallback(async () => {
    if (!id) return;
    const requestId = ++feedRequestRef.current;
    const started = postsRef.current.slice();
    setLoading(true);
    try {
      const params = buildFeedParams();
      const [singleRes, listRes] = await Promise.all([
        api.get<ExplorePost>(`/api/explore/posts/${id}`),
        api.get<ExplorePost[] | { data?: ExplorePost[] }>(`/api/explore/posts?${params.toString()}`),
      ]);
      if (requestId !== feedRequestRef.current) return;
      const singleBody = singleRes.data as ExplorePost | { data?: ExplorePost } | undefined;
      const single = (singleBody as { data?: ExplorePost })?.data ?? (singleBody as ExplorePost);
      const parsed = parseFeedList(listRes.data);
      const merged = mergeVideoPosts(parsed.items, single);
      const start = Math.max(0, merged.findIndex((p) => p.id === id));
      setPosts((current) => merged.map((item) => preserveReelEngagement(item, current, started)));
      setActiveIndex(start >= 0 ? start : 0);
      setNextCursor(parsed.next);
      setHasMoreFeed(parsed.more);
    } finally {
      if (requestId === feedRequestRef.current) setLoading(false);
    }
  }, [buildFeedParams, id, mergeVideoPosts, parseFeedList]);

  const appendFeedPage = useCallback(async () => {
    if (!reelHasAnotherPage(hasMoreFeed, nextCursor) || appendInFlightRef.current) return;
    appendInFlightRef.current = true;
    try {
      const params = buildFeedParams(nextCursor);
      const listRes = await api.get(`/api/explore/posts?${params.toString()}`);
      const parsed = parseFeedList(listRes.data);
      setPosts((prev) =>
        appendExploreReelVideos(prev, parsed.items, (item) =>
          firstSlideIsVideo(item.media_urls, item.media_meta),
        ),
      );
      setNextCursor(parsed.next);
      setHasMoreFeed(parsed.more);
    } finally {
      appendInFlightRef.current = false;
    }
  }, [buildFeedParams, hasMoreFeed, nextCursor, parseFeedList]);

  useEffect(() => {
    void loadFeed();
  }, [loadFeed]);

  useEffect(() => {
    if (posts.length === 0) return;
    if (activeIndex >= posts.length - 3 && hasMoreFeed) {
      void appendFeedPage();
    }
  }, [activeIndex, appendFeedPage, hasMoreFeed, posts.length]);

  const advanceToNextVideo = useCallback(() => {
    const sheetOpen = commentsOpen || shareOpen || reportTarget != null || menuOpen;
    if (
      !shouldAdvanceExploreReel({
        commentsOpen,
        shareOpen,
        reportOpen: reportTarget != null || menuOpen,
        dragging: listDragging,
        index: activeIndex,
        length: posts.length,
      })
    ) {
      const nowhereToGo = activeIndex >= posts.length - 1 && !reelHasAnotherPage(hasMoreFeed, nextCursor);
      pendingEndRef.current = !nowhereToGo && (sheetOpen || listDragging || activeIndex >= posts.length - 1);
      pendingEndPostIdRef.current = pendingEndRef.current ? (posts[activeIndex]?.id ?? null) : null;
      return;
    }
    pendingEndRef.current = false;
    pendingEndPostIdRef.current = null;
    const next = activeIndex + 1;
    setActiveIndex(next);
    listRef.current?.scrollToIndex({ index: next, animated: true });
  }, [
    activeIndex,
    commentsOpen,
    hasMoreFeed,
    listDragging,
    menuOpen,
    nextCursor,
    posts,
    reportTarget,
    shareOpen,
  ]);

  useEffect(() => {
    if (!pendingEndRef.current) return;
    const activeId = posts[activeIndex]?.id ?? null;
    if (!pendingReelAdvanceStillApplies(pendingEndPostIdRef.current, activeId)) {
      pendingEndRef.current = false;
      pendingEndPostIdRef.current = null;
      return;
    }
    if (commentsOpen || shareOpen || reportTarget || menuOpen || listDragging) return;
    pendingEndRef.current = false;
    pendingEndPostIdRef.current = null;
    advanceToNextVideo();
  }, [
    activeIndex,
    advanceToNextVideo,
    commentsOpen,
    listDragging,
    menuOpen,
    posts,
    reportTarget,
    shareOpen,
  ]);

  const finishListDrag = useCallback(
    (y: number) => {
      if (dragClearTimer.current) {
        clearTimeout(dragClearTimer.current);
        dragClearTimer.current = null;
      }
      const next = Math.round(y / screenHeight);
      if (next !== activeIndex && next >= 0 && next < posts.length) setActiveIndex(next);
      setListDragging(false);
    },
    [activeIndex, posts.length, screenHeight],
  );

  const onScrollEndDrag = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      lastOffsetRef.current = y;
      const velocityY = (e.nativeEvent as { velocity?: { y?: number } }).velocity?.y;
      const page = y / Math.max(screenHeight, 1);
      const aligned = Math.abs(page - Math.round(page)) < 0.02;
      const settled = velocityY == null ? aligned : Math.abs(velocityY) < 0.05;
      if (settled) {
        finishListDrag(y);
        return;
      }
      const armFallback = (attempt: number) => {
        if (dragClearTimer.current) clearTimeout(dragClearTimer.current);
        dragClearTimer.current = setTimeout(() => {
          dragClearTimer.current = null;
          const offset = lastOffsetRef.current;
          const page = offset / Math.max(screenHeight, 1);
          const aligned = Math.abs(page - Math.round(page)) < 0.02;
          if (!aligned && attempt < 4) {
            armFallback(attempt + 1);
            return;
          }
          finishListDrag(offset);
        }, 700);
      };
      armFallback(0);
    },
    [finishListDrag, screenHeight],
  );

  const onMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      finishListDrag(e.nativeEvent.contentOffset.y);
    },
    [finishListDrag],
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

  const loadComments = useCallback(async (postId: string, offset: number, append: boolean) => {
    const requestId = ++commentsRequestRef.current;
    if (!append) {
      setComments([]);
      setCommentsOffset(0);
      setHasMoreComments(false);
    }
    setCommentsLoading(true);
    try {
      let cursor = offset;
      let pageAppend = append;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const res = await api.get<ExploreComment[]>(
          `/api/explore/posts/${postId}/comments?limit=20&offset=${cursor}`,
        );
        if (requestId !== commentsRequestRef.current) return;
        const raw = res.data as
          | ExploreComment[]
          | { data?: ExploreComment[]; next_offset?: number; has_more?: boolean }
          | undefined;
        const page = Array.isArray(raw) ? { data: raw } : raw;
        const list = page?.data ?? [];
        const nextOffset = !Array.isArray(raw) ? raw?.next_offset : undefined;
        const hasMore = !Array.isArray(raw) && Boolean(raw?.has_more ?? nextOffset != null);
        const skipTo = nextOffsetAfterEmptyCommentPage({
          offset: cursor,
          visibleCount: list.length,
          hasMore,
          nextOffset,
        });
        if (skipTo == null || attempt === 4) {
          setComments((prev) => (pageAppend ? appendExploreCommentPage(prev, list) : list));
          setCommentsOffset(typeof nextOffset === "number" ? nextOffset : cursor + list.length);
          setHasMoreComments(hasMore);
          return;
        }
        cursor = skipTo;
        pageAppend = true;
      }
    } finally {
      if (requestId === commentsRequestRef.current) setCommentsLoading(false);
    }
  }, []);

  const openComments = useCallback(async () => {
    const post = posts[activeIndex];
    if (!post) return;
    setReplyToCommentId(null);
    setCommentInput("");
    setCommentsOpen(true);
    await loadComments(post.id, 0, false);
  }, [activeIndex, loadComments, posts]);

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
        setComments((prev) => placeExploreComment(prev, normalized));
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

  const shareFailureLabels = useMemo(
    () => ({
      title: t("customer.explorePost.shareMediaFailedTitle"),
      body: t("customer.explorePost.shareMediaFailedBody"),
      cancel: t("common.cancel"),
      shareLink: t("customer.explorePost.shareLink"),
    }),
    [t],
  );

  const buildShareInput = useCallback((post: ExplorePost) => {
    return {
      postId: post.id,
      caption: post.caption,
      providerName: post.provider?.business_name || "Beautonomi",
      providerSlug: post.provider?.slug,
      mediaUrls: post.media_urls,
      displayUrl: post.display_url,
      playbackPath: post.playback_path,
      mediaMeta: post.media_meta,
      webBaseUrl: APP_URL,
      mediaIndex: 0,
    };
  }, []);

  const handleShareAction = useCallback(
    async (post: ExplorePost, action: ExploreShareAction) => {
      const input = buildShareInput(post);
      haptic.light();
      if (action === "link") {
        await shareExplorePostLink(input);
      } else if (action === "media") {
        await shareExplorePostMedia(input, shareFailureLabels);
      } else if (action === "copy") {
        await copyExplorePostLink(input);
        Alert.alert(t("customer.explorePost.linkCopied"));
      }
    },
    [buildShareInput, shareFailureLabels, t],
  );

  const openShareSheet = useCallback(
    (post: ExplorePost) => {
      setShareOpen(true);
      void presentExplorePostShareActions(
        buildShareInput(post),
        {
          sheetTitle: t("customer.explorePost.shareSheetTitle"),
          shareLink: t("customer.explorePost.shareLink"),
          shareMedia: t("customer.explorePost.sharePhoto"),
          shareMediaVideo: t("customer.explorePost.shareVideo"),
          copyLink: t("customer.explorePost.copyLink"),
          cancel: t("common.cancel"),
        },
        (action) => handleShareAction(post, action),
        () => setShareOpen(false),
      );
    },
    [buildShareInput, handleShareAction, t],
  );

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
        onShare={() => openShareSheet(item)}
        onMorePress={showMoreOptions}
        onReelEnd={advanceToNextVideo}
      />
    ),
    [
      activeIndex,
      advanceToNextVideo,
      muted,
      openComments,
      openShareSheet,
      screenHeight,
      showMoreOptions,
      toggleLike,
      toggleSave,
    ],
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
          ref={listRef}
          {...verticalFlatListPerf}
          data={posts}
          keyExtractor={(p) => p.id}
          renderItem={renderItem}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          snapToInterval={screenHeight}
          decelerationRate="fast"
          onScrollBeginDrag={() => setListDragging(true)}
          onScroll={(e) => {
            lastOffsetRef.current = e.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
          onScrollEndDrag={onScrollEndDrag}
          onMomentumScrollEnd={onMomentumScrollEnd}
          onScrollToIndexFailed={(info) => {
            listRef.current?.scrollToOffset({
              offset: info.averageItemLength * info.index,
              animated: true,
            });
          }}
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
        {commentsLoading && comments.length === 0 ? (
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
        {hasMoreComments ? (
          <TouchableOpacity
            onPress={() => {
              const post = posts[activeIndex];
              if (!post || commentsLoading) return;
              void loadComments(post.id, commentsOffset, true);
            }}
            disabled={commentsLoading}
            accessibilityRole="button"
            style={{ paddingVertical: 12 }}
          >
            <Text style={{ fontSize: 13, fontWeight: "600", color: Colors.primary }}>
              {commentsLoading
                ? t("customer.explorePost.loadingComments", "Loading...")
                : t("customer.explorePost.loadMoreComments", "Load more comments")}
            </Text>
          </TouchableOpacity>
        ) : null}
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
