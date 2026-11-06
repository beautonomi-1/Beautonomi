import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Modal,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Pressable,
  useWindowDimensions,
} from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, { useSharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEventListener } from "expo";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { ActionButton } from "@/components/ui/ActionButton";
import { useAfterHide } from "@/hooks/useAfterHide";
import { twStyle } from "@/lib/twStyle";
import { useTranslation } from "@beautonomi/i18n";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import {
  clampExploreTrimRange,
  defaultExploreVideoTrim,
  EXPLORE_MIN_CLIP_MS,
  type ExploreVideoTrimWindow,
} from "@/lib/explore-video-trim";
import { exploreThumbnailFileUri } from "@/lib/explore-video-poster";

export type ExploreVideoTrimResult = ExploreVideoTrimWindow & {
  source_duration_ms: number;
  poster_uri?: string;
  poster_width?: number;
  poster_height?: number;
};

type Props = {
  visible: boolean;
  videoUri: string;
  fullDurationMs: number;
  maxClipMs: number;
  source: "camera" | "library" | "retrim";
  initialTrim?: ExploreVideoTrimWindow;
  queueLabel?: { index: number; total: number } | null;
  onConfirm: (result: ExploreVideoTrimResult) => void;
  onCancel: () => void;
  onAfterHide?: () => void;
};

function formatSec(ms: number) {
  const s = Math.max(0, ms / 1000);
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
}

const LOAD_TIMEOUT_MS = 10_000;
const THUMB_COUNT = 8;

export function ExploreVideoTrimEditor({
  visible,
  videoUri,
  fullDurationMs,
  maxClipMs,
  source,
  initialTrim,
  queueLabel,
  onConfirm,
  onCancel,
  onAfterHide,
}: Props) {
  useAfterHide(visible, onAfterHide);
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const { t } = useTranslation();
  const ep = (key: string, opts?: Record<string, unknown>) =>
    t(`provider.mobile.screens.explorePosts.${key}`, opts) as string;

  const closingRef = useRef(false);
  const scrubbingRef = useRef(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [resolvedFullMs, setResolvedFullMs] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const [trim, setTrim] = useState<ExploreVideoTrimWindow>({ trim_start_ms: 0, trim_end_ms: maxClipMs });
  const [thumbs, setThumbs] = useState<{ time: number; ref: unknown }[]>([]);
  const [paused, setPaused] = useState(true);
  const [playheadMs, setPlayheadMs] = useState(0);
  const trackWidth = Math.max(200, screenWidth - 40);

  const playerUri =
    visible && videoUri ? (loadAttempt === 0 ? videoUri : `${videoUri}#load=${loadAttempt}`) : null;

  const player = useVideoPlayer(playerUri, (p) => {
    p.loop = false;
    p.muted = false;
    p.timeUpdateEventInterval = 0.1;
  });

  useEffect(() => {
    if (!visible) {
      setResolvedFullMs(0);
      setLoadError(false);
      setThumbs([]);
      closingRef.current = false;
      setPaused(true);
      setLoadAttempt(0);
      return;
    }
    const hint = fullDurationMs > 0 ? fullDurationMs : maxClipMs;
    const initial =
      initialTrim && hint > 0
        ? clampExploreTrimRange(initialTrim, hint, maxClipMs, EXPLORE_MIN_CLIP_MS, "window")
        : hint > 0
          ? defaultExploreVideoTrim(hint, maxClipMs)
          : { trim_start_ms: 0, trim_end_ms: maxClipMs };
    setTrim(initial);
  }, [visible, videoUri, fullDurationMs, maxClipMs, initialTrim]);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => {
      if (resolvedFullMs <= 0) setLoadError(true);
    }, LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [visible, resolvedFullMs, videoUri, loadAttempt]);

  useEventListener(player, "sourceLoad", () => {
    const d = player.duration;
    if (typeof d === "number" && Number.isFinite(d) && d > 0) {
      const ms = Math.round(d * 1000);
      setResolvedFullMs(ms);
      setLoadError(false);
      setTrim((prev) =>
        clampExploreTrimRange(
          prev.trim_end_ms > prev.trim_start_ms ? prev : defaultExploreVideoTrim(ms, maxClipMs),
          ms,
          maxClipMs,
          EXPLORE_MIN_CLIP_MS,
          "window",
        ),
      );
    }
  });

  useEventListener(player, "statusChange", ({ status }) => {
    if (status === "error") setLoadError(true);
    if (status === "readyToPlay") {
      const d = player.duration;
      if (typeof d === "number" && Number.isFinite(d) && d > 0) {
        setResolvedFullMs(Math.round(d * 1000));
        setLoadError(false);
      }
    }
  });

  useEventListener(player, "timeUpdate", ({ currentTime }) => {
    const ms = Math.round(currentTime * 1000);
    setPlayheadMs(ms);
    if (scrubbingRef.current) return;
    const endSec = trim.trim_end_ms / 1000;
    if (currentTime >= endSec - 0.08) {
      player.currentTime = trim.trim_start_ms / 1000;
      void player.play();
    }
  });

  const ready = visible && resolvedFullMs > 0 && !loadError;

  useEffect(() => {
    if (!ready) return;
    void (async () => {
      try {
        const times = Array.from({ length: THUMB_COUNT }, (_, i) =>
          (resolvedFullMs / 1000) * (i / (THUMB_COUNT - 1 || 1)),
        );
        const out = await player.generateThumbnailsAsync(times, { maxWidth: 120 });
        if (!visible) return;
        setThumbs(out.map((thumb, i) => ({ time: times[i] ?? 0, ref: thumb })));
      } catch {
        setThumbs([]);
      }
    })();
  }, [ready, resolvedFullMs, player, visible]);

  useEffect(() => {
    if (!ready || paused) {
      player.pause();
      return;
    }
    player.currentTime = trim.trim_start_ms / 1000;
    void player.play();
  }, [ready, paused, trim.trim_start_ms, player]);

  const clipMs = trim.trim_end_ms - trim.trim_start_ms;
  const startRatio = resolvedFullMs > 0 ? trim.trim_start_ms / resolvedFullMs : 0;
  const endRatio = resolvedFullMs > 0 ? trim.trim_end_ms / resolvedFullMs : 1;

  const applyTrim = useCallback(
    (next: ExploreVideoTrimWindow, moved: "start" | "end" | "window") => {
      if (resolvedFullMs <= 0) return;
      const clamped = clampExploreTrimRange(next, resolvedFullMs, maxClipMs, EXPLORE_MIN_CLIP_MS, moved);
      if (
        clamped.trim_start_ms !== next.trim_start_ms ||
        clamped.trim_end_ms !== next.trim_end_ms
      ) {
        void Haptics.selectionAsync();
      }
      setTrim(clamped);
    },
    [resolvedFullMs, maxClipMs],
  );

  const dragStart = useSharedValue(0);
  const dragEnd = useSharedValue(1);
  const gestureBaseStart = useSharedValue(0);
  const gestureBaseEnd = useSharedValue(1);

  useEffect(() => {
    dragStart.value = startRatio;
    dragEnd.value = endRatio;
  }, [startRatio, endRatio, dragStart, dragEnd]);

  const updateFromRatios = useCallback(
    (s: number, e: number, moved: "start" | "end" | "window") => {
      if (resolvedFullMs <= 0) return;
      const startMs = Math.round(s * resolvedFullMs);
      const endMs = Math.round(e * resolvedFullMs);
      applyTrim({ trim_start_ms: startMs, trim_end_ms: endMs }, moved);
    },
    [applyTrim, resolvedFullMs],
  );

  const syncGestureBaseFromTrim = useCallback(() => {
    if (resolvedFullMs <= 0) return;
    gestureBaseStart.value = trim.trim_start_ms / resolvedFullMs;
    gestureBaseEnd.value = trim.trim_end_ms / resolvedFullMs;
  }, [trim.trim_start_ms, trim.trim_end_ms, resolvedFullMs, gestureBaseStart, gestureBaseEnd]);

  const setScrubbing = useCallback((active: boolean) => {
    scrubbingRef.current = active;
    if (active) {
      player.pause();
      setPaused(true);
    }
  }, [player]);

  const panStart = Gesture.Pan()
    .onBegin(() => {
      scheduleOnRN(syncGestureBaseFromTrim);
      scheduleOnRN(setScrubbing, true);
    })
    .onUpdate((ev) => {
      const delta = ev.translationX / trackWidth;
      const next = Math.min(gestureBaseEnd.value - 0.05, Math.max(0, gestureBaseStart.value + delta));
      scheduleOnRN(updateFromRatios, next, gestureBaseEnd.value, "start");
    })
    .onFinalize(() => {
      scheduleOnRN(setScrubbing, false);
    });

  const panEnd = Gesture.Pan()
    .onBegin(() => {
      scheduleOnRN(syncGestureBaseFromTrim);
      scheduleOnRN(setScrubbing, true);
    })
    .onUpdate((ev) => {
      const delta = ev.translationX / trackWidth;
      const next = Math.min(1, Math.max(gestureBaseStart.value + 0.05, gestureBaseEnd.value + delta));
      scheduleOnRN(updateFromRatios, gestureBaseStart.value, next, "end");
    })
    .onFinalize(() => {
      scheduleOnRN(setScrubbing, false);
    });

  const panWindow = Gesture.Pan()
    .onBegin(() => {
      scheduleOnRN(syncGestureBaseFromTrim);
      scheduleOnRN(setScrubbing, true);
    })
    .onUpdate((ev) => {
      const len = gestureBaseEnd.value - gestureBaseStart.value;
      const delta = ev.translationX / trackWidth;
      let s = gestureBaseStart.value + delta;
      let e = gestureBaseEnd.value + delta;
      if (s < 0) {
        s = 0;
        e = len;
      }
      if (e > 1) {
        e = 1;
        s = 1 - len;
      }
      scheduleOnRN(updateFromRatios, s, e, "window");
    })
    .onFinalize(() => {
      scheduleOnRN(setScrubbing, false);
    });

  const handleConfirm = () => {
    if (!ready || closingRef.current) return;
    closingRef.current = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    void (async () => {
      let posterUri: string | undefined;
      let posterWidth: number | undefined;
      let posterHeight: number | undefined;
      try {
        await Promise.race([
          (async () => {
            const thumbs = await player.generateThumbnailsAsync(trim.trim_start_ms / 1000, {
              maxWidth: 1080,
            });
            const thumb = thumbs[0];
            const direct = exploreThumbnailFileUri(thumb);
            if (direct) {
              posterUri = direct;
              posterWidth = thumb?.width;
              posterHeight = thumb?.height;
              return;
            }
            if (!thumb) return;
            const rendered = await ImageManipulator.manipulate(thumb).renderAsync();
            const saved = await rendered.saveAsync({ compress: 0.85, format: SaveFormat.JPEG });
            if (saved.uri) {
              posterUri = saved.uri;
              posterWidth = saved.width;
              posterHeight = saved.height;
            }
          })(),
          new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error("poster_timeout")), 4000);
          }),
        ]);
      } catch {
        posterUri = undefined;
      }
      onConfirm({
        ...trim,
        source_duration_ms: resolvedFullMs,
        ...(posterUri
          ? { poster_uri: posterUri, poster_width: posterWidth, poster_height: posterHeight }
          : {}),
      });
    })();
  };

  const handleCancel = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    onCancel();
  };

  const cancelLabel =
    source === "camera" ? ep("retake") : ep("cancel");

  const nudgeTrim = (moved: "start" | "end", deltaMs: number) => {
    if (moved === "start") {
      applyTrim(
        { trim_start_ms: trim.trim_start_ms + deltaMs, trim_end_ms: trim.trim_end_ms },
        "start",
      );
    } else {
      applyTrim(
        { trim_start_ms: trim.trim_start_ms, trim_end_ms: trim.trim_end_ms + deltaMs },
        "end",
      );
    }
  };

  const maxSec = Math.round(maxClipMs / 1000);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleCancel}
    >
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#fff" }}>
        <View style={{ flex: 1, paddingTop: insets.top }}>
          <View style={twStyle("flex-row items-center justify-between px-4 py-3 border-b border-gray-100")}>
            <TouchableOpacity onPress={handleCancel} accessibilityRole="button">
              <Text style={twStyle("text-base font-semibold text-violet-700")}>{cancelLabel}</Text>
            </TouchableOpacity>
            <View style={twStyle("items-center flex-1")}>
              <Text style={twStyle("text-base font-bold text-gray-900")}>{ep("trimVideoTitle")}</Text>
              {queueLabel ? (
                <Text style={twStyle("text-xs text-gray-500")}>
                  {ep("trimQueueCounter", { index: queueLabel.index, total: queueLabel.total })}
                </Text>
              ) : null}
            </View>
            <View style={{ width: 72 }} />
          </View>

          <Text style={twStyle("text-sm text-gray-600 px-5 pt-3 pb-2")}>{ep("trimVideoHint")}</Text>

          <Pressable
            onPress={() => setPaused((p) => !p)}
            style={{
              marginHorizontal: 20,
              aspectRatio: 4 / 5,
              maxHeight: 360,
              borderRadius: 16,
              overflow: "hidden",
              backgroundColor: "#111",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {ready ? (
              <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} />
            ) : loadError ? (
              <View style={twStyle("items-center px-6")}>
                <Text style={twStyle("text-white text-center mb-3")}>{ep("trimVideoLoadFailed")}</Text>
                <View style={twStyle("flex-row gap-2 w-full")}>
                  <ActionButton
                    label={ep("retry")}
                    variant="secondary"
                    onPress={() => {
                      setLoadError(false);
                      setResolvedFullMs(0);
                      setThumbs([]);
                      setLoadAttempt((n) => n + 1);
                    }}
                    style={twStyle("flex-1")}
                  />
                  <ActionButton
                    label={ep("discardClip")}
                    variant="secondary"
                    onPress={handleCancel}
                    style={twStyle("flex-1")}
                  />
                </View>
              </View>
            ) : (
              <ActivityIndicator size="large" color="#fff" />
            )}
            {ready && paused ? (
              <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
                  <IoniconsPlay />
                </View>
              </View>
            ) : null}
          </Pressable>

          {ready ? (
            <>
              <View style={twStyle("flex-row justify-between px-5 mt-3")}>
                <Text style={twStyle("text-xs text-gray-500 tabular-nums")}>{formatSec(trim.trim_start_ms)}</Text>
                <Text style={twStyle("text-xs text-gray-500")}>
                  {ep("trimSelectedLength", {
                    seconds: (clipMs / 1000).toFixed(1),
                    max: maxSec,
                  })}
                </Text>
                <Text style={twStyle("text-xs text-gray-500 tabular-nums")}>{formatSec(trim.trim_end_ms)}</Text>
              </View>

              <View style={[styles.trackWrap, { width: trackWidth, direction: "ltr" }]}>
                <View style={styles.filmstrip}>
                  {thumbs.length > 0
                    ? thumbs.map((thumb, i) => (
                        <Image
                          key={`t-${i}`}
                          source={thumb.ref as never}
                          style={{ flex: 1, height: 48 }}
                          contentFit="cover"
                        />
                      ))
                    : null}
                </View>
                <View
                  style={[
                    styles.dim,
                    { left: 0, width: `${startRatio * 100}%` },
                  ]}
                />
                <View
                  style={[
                    styles.dim,
                    { right: 0, width: `${(1 - endRatio) * 100}%` },
                  ]}
                />
                <GestureDetector gesture={panWindow}>
                  <Animated.View
                    style={[
                      styles.selection,
                      {
                        left: startRatio * trackWidth,
                        width: (endRatio - startRatio) * trackWidth,
                      },
                    ]}
                  />
                </GestureDetector>
                <GestureDetector gesture={panStart}>
                  <View
                    style={[styles.handle, { left: startRatio * trackWidth - 12 }]}
                    accessible
                    accessibilityRole="adjustable"
                    accessibilityLabel={ep("trimHandleStartA11y")}
                    accessibilityValue={{ text: formatSec(trim.trim_start_ms) }}
                    onAccessibilityAction={(e) => {
                      if (e.nativeEvent.actionName === "increment") nudgeTrim("start", 500);
                      if (e.nativeEvent.actionName === "decrement") nudgeTrim("start", -500);
                    }}
                  />
                </GestureDetector>
                <GestureDetector gesture={panEnd}>
                  <View
                    style={[styles.handle, { left: endRatio * trackWidth - 12 }]}
                    accessible
                    accessibilityRole="adjustable"
                    accessibilityLabel={ep("trimHandleEndA11y")}
                    accessibilityValue={{ text: formatSec(trim.trim_end_ms) }}
                    onAccessibilityAction={(e) => {
                      if (e.nativeEvent.actionName === "increment") nudgeTrim("end", 500);
                      if (e.nativeEvent.actionName === "decrement") nudgeTrim("end", -500);
                    }}
                  />
                </GestureDetector>
                {resolvedFullMs > 0 ? (
                  <View
                    pointerEvents="none"
                    style={[
                      styles.playhead,
                      { left: (playheadMs / resolvedFullMs) * trackWidth - 1 },
                    ]}
                  />
                ) : null}
              </View>
            </>
          ) : !loadError ? (
            <Text style={twStyle("text-sm text-gray-500 mt-4 text-center")}>{ep("trimVideoLoading")}</Text>
          ) : null}

          <View style={[twStyle("px-5 mt-auto"), { paddingBottom: insets.bottom + 16 }]}>
            <ActionButton
              label={ep("trimVideoConfirm")}
              disabled={!ready}
              onPress={handleConfirm}
            />
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

function IoniconsPlay() {
  return (
    <View
      style={{
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: "rgba(0,0,0,0.45)",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: "#fff", fontSize: 22, marginStart: 4 }}>▶</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  trackWrap: {
    alignSelf: "center",
    height: 56,
    marginTop: 12,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#111",
  },
  filmstrip: {
    ...StyleSheet.absoluteFill,
    flexDirection: "row",
  },
  dim: {
    position: "absolute",
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  selection: {
    position: "absolute",
    top: 0,
    bottom: 0,
    borderWidth: 2,
    borderColor: "#7c3aed",
  },
  handle: {
    position: "absolute",
    top: 4,
    bottom: 4,
    width: 24,
    borderRadius: 4,
    backgroundColor: "#7c3aed",
  },
  playhead: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: "#fff",
  },
});
