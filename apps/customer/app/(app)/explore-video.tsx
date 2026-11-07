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
import { useVideoPlayer, VideoView, type VideoPlayer } from "expo-video";
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
import { runVideoPlayer, withVideoPlayer } from "@/lib/video-player-access";
import {
  appendExploreCommentPage,
  nextOffsetAfterEmptyCommentPage,
  appendExploreReelVideos,
  exploreClipPlayheadAtEnd,
  exploreClipShowsReplay,
  exploreClipWatchedMs,
  exploreCommentTotal,
  placeExploreComment,
  removeExploreComment,
  removedExploreCommentCount,
  preserveReelEngagement,
  reelHasAnotherPage,
} from "@/lib/explore-reel-feed";
import { ExploreVideoReelSideLogo } from "@/components/explore/ExploreVideoReelBrand";
import { trackExploreView, trackExploreWatchProgress } from "@/lib/explore-analytics";
import { DirectionalIcon } from "@/components/ui/DirectionalIcon";
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import { useUserBlocks } from "@/hooks/useUserBlocks";
import { useSocialCapability } from "@/hooks/useSafetySettings";
import {
  ExploreCommentComposer,
  ExploreCommentList,
  exploreReplyTarget,
  type ExploreReplyTarget,
} from "@/components/explore/ExploreCommentThread";
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
  paused,
  muted,
  onPlayingChange,
}: {
  post: ExplorePost;
  active: boolean;
  paused?: boolean;
  muted: boolean;
  onPlayingChange?: (playing: boolean) => void;
}) {
  const { t } = useTranslation();
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
  const [showReplay, setShowReplay] = useState(false);
  const playedActiveRef = useRef(false);
  const watchedMsRef = useRef(0);
  const finishedRef = useRef(false);
  const playingPostIdRef = useRef<string | null>(null);
  const playerRef = useRef<VideoPlayer | null>(null);
  const playbackSampleRef = useRef({ time: 0, duration: 0 });
  // useVideoPlayer releases the native object in an earlier cleanup than the
  // effects below. Pause first, and never read currentTime/duration after that.
  useEffect(() => {
    return () => {
      const current = playerRef.current;
      if (!current) return;
      runVideoPlayer(() => {
        current.pause();
      });
    };
  }, []);
  const player = useVideoPlayer(uri, (p) => {
    p.loop = trimStartMs == null;
    p.muted = effectiveMuted;
    if (!active || paused) p.pause();
    else p.play();
  });
  playerRef.current = player;

  useEffect(() => {
    finishedRef.current = false;
    setShowReplay(false);
  }, [post.id]);

  useEffect(() => {
    if (!active) setShowReplay(false);
  }, [active]);

  const restartClip = useCallback(() => {
    finishedRef.current = false;
    setShowReplay(false);
    setProgress(0);
    setPlaybackTimeMs(0);
    const start = (trimStartMs ?? 0) / 1000;
    runVideoPlayer(() => {
      player.currentTime = start;
      player.play();
    });
  }, [player, trimStartMs]);

  useExploreTrimLoop(player, trimStartMs, trimEndMs, active && !paused);

  useEffect(() => {
    if (!active) return;
    const start = (trimStartMs ?? 0) / 1000;
    const sub = player.addListener("playToEnd", () => {
      finishedRef.current = true;
      runVideoPlayer(() => {
        player.currentTime = start;
        player.play();
      });
    });
    return () => {
      runVideoPlayer(() => sub.remove());
    };
  }, [active, player, trimStartMs]);

  useEffect(() => {
    runVideoPlayer(() => {
      player.muted = !active || Boolean(paused) || effectiveMuted;
    });
  }, [active, effectiveMuted, paused, player]);

  useEffect(() => {
    if (!active) {
      runVideoPlayer(() => player.pause());
      return;
    }
    playingPostIdRef.current = post.id;
    playedActiveRef.current = true;
    watchedMsRef.current = 0;
    runVideoPlayer(() => {
      const time = player.currentTime || 0;
      const duration = player.duration || 0;
      const start = (trimStartMs ?? 0) / 1000;
      const atEnd =
        finishedRef.current ||
        exploreClipPlayheadAtEnd({ currentSec: time, durationSec: duration, trimEndMs });
      if (atEnd || (trimStartMs != null && time < start - 0.05)) {
        player.currentTime = start;
      }
      finishedRef.current = false;
      player.play();
    });
    void trackExploreView(post.id);
    return () => {
      const playedId = playingPostIdRef.current;
      playingPostIdRef.current = null;
      if (!playedActiveRef.current || playedId !== post.id) {
        playedActiveRef.current = false;
        return;
      }
      playedActiveRef.current = false;
      const live = exploreClipWatchedMs(
        withVideoPlayer(() => player.currentTime || 0, playbackSampleRef.current.time),
        trimStartMs,
        trimEndMs,
      );
      const watched = Math.max(watchedMsRef.current, live);
      if (watched > 0 && playedId) void trackExploreWatchProgress(playedId, watched);
    };
  }, [active, player, post.id, trimEndMs, trimStartMs]);

  useEffect(() => {
    if (!active) return;
    runVideoPlayer(() => {
      if (paused) player.pause();
      else player.play();
    });
  }, [active, paused, player]);

  useEffect(() => {
    if (!active || paused) return;
    const timer = setInterval(() => {
      const sample = withVideoPlayer(() => {
        return {
          playing: Boolean(player.playing),
          t: player.currentTime || 0,
          duration: player.duration || 0,
        };
      }, null);
      if (!sample) return;
      playbackSampleRef.current = { time: sample.t, duration: sample.duration };
      onPlayingChange?.(sample.playing);
      const t = sample.t;
      const atEnd = exploreClipPlayheadAtEnd({
        currentSec: t,
        durationSec: sample.duration,
        trimEndMs,
      });
      if (atEnd) finishedRef.current = true;
      else if (sample.playing) finishedRef.current = false;
      const watched = exploreClipWatchedMs(t, trimStartMs, trimEndMs);
      if (watched > watchedMsRef.current) watchedMsRef.current = watched;
      setShowReplay(exploreClipShowsReplay(sample.playing, atEnd));
      if (trimStartMs != null && trimEndMs != null) {
        const lenMs = trimEndMs - trimStartMs;
        const relMs = Math.max(0, Math.floor(t * 1000) - trimStartMs);
        setPlaybackTimeMs(relMs);
        if (lenMs > 0) setProgress(Math.min(1, relMs / lenMs));
        return;
      }
      setPlaybackTimeMs(Math.floor(t * 1000));
      if (sample.duration > 0) setProgress(Math.min(1, t / sample.duration));
    }, 200);
    return () => clearInterval(timer);
  }, [active, paused, onPlayingChange, player, trimStartMs, trimEndMs]);

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
      {showReplay ? (
        <TouchableOpacity
          onPress={restartClip}
          accessibilityRole="button"
          accessibilityLabel={t("customer.exploreVideo.replay")}
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: 72,
            height: 72,
            marginTop: -36,
            marginLeft: -36,
            borderRadius: 36,
            backgroundColor: "rgba(0,0,0,0.55)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="refresh" size={36} color="#fff" />
        </TouchableOpacity>
      ) : null}
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
  paused,
  muted,
  onToggleMute,
  onTogglePlayPause,
  onLike,
  onSave,
  onOpenComments,
  onShare,
  onMorePress,
}: {
  post: ExplorePost;
  active: boolean;
  screenHeight: number;
  paused: boolean;
  muted: boolean;
  onToggleMute: () => void;
  onTogglePlayPause: () => void;
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
  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const useNativeDriver = Platform.OS !== "web";
  const [clipPlaying, setClipPlaying] = useState(false);

  const handlePress = useCallback(() => {
    const now = Date.now();
    if (now - lastTap.current < 280) {
      if (singleTapTimer.current) {
        clearTimeout(singleTapTimer.current);
        singleTapTimer.current = null;
      }
      onLike();
      Animated.sequence([
        Animated.spring(heartAnim, { toValue: 1, useNativeDriver, speed: 20, bounciness: 12 }),
        Animated.timing(heartAnim, { toValue: 0, duration: 600, useNativeDriver, delay: 400 }),
      ]).start();
      lastTap.current = 0;
      return;
    }
    lastTap.current = now;
    if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
    singleTapTimer.current = setTimeout(() => {
      singleTapTimer.current = null;
      if (!active) return;
      onTogglePlayPause();
    }, 260);
  }, [active, heartAnim, onLike, onTogglePlayPause, useNativeDriver]);

  useEffect(() => {
    return () => {
      if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
    };
  }, []);

  const providerName = post.provider?.business_name || t("customer.explorePost.providerFallback");

  return (
    <Pressable style={{ height: screenHeight, backgroundColor: "#000" }} onPress={handlePress}>
      <ExploreVideoPlayer
        post={post}
        active={active}
        paused={paused}
        muted={muted}
        onPlayingChange={active ? setClipPlaying : undefined}
      />
      {active && paused ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: 76,
            height: 76,
            marginTop: -38,
            marginLeft: -38,
            borderRadius: 38,
            backgroundColor: "rgba(0,0,0,0.45)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="play" size={34} color="#fff" />
        </View>
      ) : null}
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
  const socialInteractions = useSocialCapability("comment");
  const canComment = socialInteractions.allowed;
  const commentInputRef = useRef<TextInput>(null);

  const [posts, setPosts] = useState<ExplorePost[]>([]);
  const [reportTarget, setReportTarget] = useState<{
    type: ContentReportTargetType;
    id: string;
    title?: string;
  } | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [muted, setMuted] = useState(true);
  const [userPaused, setUserPaused] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<ExploreComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState(false);
  const [commentsOffset, setCommentsOffset] = useState(0);
  const [hasMoreComments, setHasMoreComments] = useState(false);
  const [commentInput, setCommentInput] = useState("");
  const [commentSending, setCommentSending] = useState(false);
  const [replyTo, setReplyTo] = useState<ExploreReplyTarget | null>(null);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [hasMoreFeed, setHasMoreFeed] = useState(true);
  const [shareOpen, setShareOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const listRef = useRef<FlatList<ExplorePost>>(null);
  const postsRef = useRef(posts);
  const feedRequestRef = useRef(0);
  const commentsRequestRef = useRef(0);
  postsRef.current = posts;
  const appendInFlightRef = useRef(false);
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

  useEffect(() => {
    setUserPaused(false);
  }, [activeIndex]);

  const finishListDrag = useCallback(
    (y: number) => {
      if (dragClearTimer.current) {
        clearTimeout(dragClearTimer.current);
        dragClearTimer.current = null;
      }
      const next = Math.round(y / screenHeight);
      if (next !== activeIndex && next >= 0 && next < posts.length) setActiveIndex(next);
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
    setReplyTo(null);
    setCommentInput("");
  }, []);

  const loadComments = useCallback(async (
    postId: string,
    offset: number,
    append: boolean,
    options?: { keepVisible?: boolean },
  ) => {
    const requestId = ++commentsRequestRef.current;
    if (!append && !options?.keepVisible) {
      setComments([]);
      setCommentsOffset(0);
      setHasMoreComments(false);
    }
    setCommentsLoading(true);
    setCommentsError(false);
    try {
      let cursor = offset;
      let pageAppend = append;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const res = await api.get<ExploreComment[]>(
          `/api/explore/posts/${postId}/comments?limit=20&offset=${cursor}`,
        );
        if (requestId !== commentsRequestRef.current) return;
        if (res.error) {
          setCommentsError(true);
          return;
        }
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
    setReplyTo(null);
    setCommentInput("");
    setCommentsOpen(true);
    await loadComments(post.id, 0, false);
  }, [activeIndex, loadComments, posts]);

  const sendComment = useCallback(async () => {
    const post = posts[activeIndex];
    const text = commentInput.trim();
    if (!post || !text || !user || commentSending) return;
    setCommentSending(true);
    const parentId = replyTo?.parentId;
    setCommentInput("");
    haptic.light();
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
          parent_id: created.parent_id ?? parentId ?? null,
          body: created.body ?? text,
          author: created.author ?? {
            full_name: user.user_metadata?.full_name,
            avatar_url: user.user_metadata?.avatar_url,
          },
          replies: created.replies ?? [],
        };
        setComments((prev) => placeExploreComment(prev, normalized));
        setReplyTo(null);
        patchPost(post.id, { comment_count: (post.comment_count ?? 0) + 1 });
      }
    } catch {
      setCommentInput(text);
      Alert.alert(t("common.error"), t("customer.explorePost.errorPostComment"));
    } finally {
      setCommentSending(false);
    }
  }, [activeIndex, commentInput, commentSending, patchPost, posts, replyTo, t, user]);

  const deleteComment = useCallback(async (comment: ExploreComment) => {
    const post = posts[activeIndex];
    if (!post || !user) return;
    const ids = comment.parent_id
      ? [comment.id]
      : [comment.id, ...(comment.replies ?? []).map((reply) => reply.id)];
    const results = await Promise.all(
      ids.map((commentId) => api.delete(`/api/explore/posts/${post.id}/comments/${commentId}`)),
    );
    if (results.some((res) => res.error)) {
      Alert.alert(t("common.error"), t("customer.explorePost.errorDeleteComment"));
      void loadComments(post.id, 0, false, { keepVisible: true });
      return;
    }
    const removed = removedExploreCommentCount(comments, comment.id);
    setComments((prev) => removeExploreComment(prev, comment.id));
    patchPost(post.id, { comment_count: Math.max(0, (post.comment_count ?? removed) - removed) });
    if (replyTo?.parentId === comment.id) setReplyTo(null);
  }, [activeIndex, comments, loadComments, patchPost, posts, replyTo, t, user]);

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
        paused={index === activeIndex ? userPaused : false}
        muted={muted}
        onToggleMute={() => setMuted((m) => !m)}
        onTogglePlayPause={() => setUserPaused((p) => !p)}
        onLike={toggleLike}
        onSave={toggleSave}
        onOpenComments={openComments}
        onShare={() => openShareSheet(item)}
        onMorePress={showMoreOptions}
      />
    ),
    [
      activeIndex,
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
          scrollEnabled={!commentsOpen}
          showsVerticalScrollIndicator={false}
          snapToInterval={screenHeight}
          decelerationRate="fast"
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

      <BottomSheet
        visible={commentsOpen}
        onClose={closeComments}
        title={t("customer.explorePost.commentsTitle")}
        subtitle={(() => {
          const total = exploreCommentTotal(comments, posts[activeIndex]?.comment_count);
          return total > 0 ? String(total) : undefined;
        })()}
        footer={
          <ExploreCommentComposer
            value={commentInput}
            onChangeText={setCommentInput}
            onSend={() => void sendComment()}
            sending={commentSending}
            replyTo={replyTo}
            onCancelReply={() => setReplyTo(null)}
            canInteract={canComment}
            signedIn={Boolean(user)}
            onSignIn={() => {
              const post = posts[activeIndex];
              pushCustomerLogin(
                post ? `/(app)/explore-video?id=${encodeURIComponent(post.id)}` : "/(app)/(tabs)/explore",
              );
            }}
            onOpenSafety={() => router.push("/(app)/account-settings/content-and-safety-controls" as never)}
            viewerInitial={(user?.user_metadata?.full_name || "Y").charAt(0).toUpperCase()}
            viewerAvatarUrl={
              typeof user?.user_metadata?.avatar_url === "string" ? user.user_metadata.avatar_url : null
            }
            inputRef={commentInputRef}
          />
        }
      >
        <ExploreCommentList
          comments={comments}
          loading={commentsLoading}
          hasMore={hasMoreComments}
          loadError={commentsError}
          onRetry={() => {
            const post = posts[activeIndex];
            if (!post) return;
            void loadComments(post.id, comments.length ? commentsOffset : 0, comments.length > 0);
          }}
          onLoadMore={() => {
            const post = posts[activeIndex];
            if (!post || commentsLoading) return;
            void loadComments(post.id, commentsOffset, true);
          }}
          viewerUserId={user?.id}
          canInteract={canComment}
          onReply={
            canComment
              ? (comment) => {
                  if (!user) {
                    pushCustomerLogin(
                      `/(app)/explore-video?id=${encodeURIComponent(posts[activeIndex]?.id ?? "")}`,
                    );
                    return;
                  }
                  setReplyTo(exploreReplyTarget(comment, t("customer.explorePost.userFallback")));
                }
              : undefined
          }
          onDelete={user && canComment ? (comment) => void deleteComment(comment) : undefined}
          onReport={
            user
              ? (comment) =>
                  openContentReport("explore_comment", comment.id, t("customer.contentReport.reportComment"))
              : undefined
          }
        />
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
