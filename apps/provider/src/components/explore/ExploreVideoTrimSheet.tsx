import { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import Slider from "@react-native-community/slider";
import { useVideoPlayer, VideoView } from "expo-video";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";
import { twStyle } from "@/lib/twStyle";
import { useTranslation } from "@beautonomi/i18n";
import {
  defaultExploreVideoTrim,
  exploreMaxClipMs,
  slideExploreVideoTrimStart,
  type ExploreVideoTrimWindow,
} from "@/lib/explore-video-trim";

export type ExploreVideoTrimResult = ExploreVideoTrimWindow & {
  source_duration_ms: number;
};

type Props = {
  visible: boolean;
  videoUri: string;
  /** From picker metadata when known; pass 0 to ffprobe via player. */
  fullDurationMs: number;
  maxClipMs: number;
  onConfirm: (result: ExploreVideoTrimResult) => void;
  onCancel: () => void;
};

function formatSec(ms: number) {
  const s = Math.max(0, ms / 1000);
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function ExploreVideoTrimSheet({
  visible,
  videoUri,
  fullDurationMs,
  maxClipMs,
  onConfirm,
  onCancel,
}: Props) {
  const { t } = useTranslation();
  const ep = (key: string, opts?: Record<string, unknown>) =>
    t(`provider.mobile.screens.explorePosts.${key}`, opts) as string;

  const player = useVideoPlayer(visible ? videoUri : null, (p) => {
    p.loop = true;
    p.muted = true;
  });

  const [probedMs, setProbedMs] = useState<number | null>(null);
  const [startMs, setStartMs] = useState(0);

  useEffect(() => {
    if (!visible) {
      setProbedMs(null);
      return;
    }
    setStartMs(0);
    player.pause();
    void player.play();
  }, [visible, videoUri, player]);

  useEffect(() => {
    if (!visible) return;
    const timer = setInterval(() => {
      const d = player.duration;
      if (typeof d === "number" && Number.isFinite(d) && d > 0) {
        setProbedMs(Math.round(d * 1000));
      }
    }, 200);
    return () => clearInterval(timer);
  }, [visible, player, videoUri]);

  const resolvedFullMs =
    probedMs != null && probedMs > 0
      ? probedMs
      : fullDurationMs > 0
        ? fullDurationMs
        : 0;

  const clipMs = useMemo(
    () => (resolvedFullMs > 0 ? exploreMaxClipMs(resolvedFullMs, maxClipMs) : maxClipMs),
    [resolvedFullMs, maxClipMs],
  );
  const maxStartMs = Math.max(0, resolvedFullMs - clipMs);

  const trim = useMemo(
    () =>
      resolvedFullMs <= 0
        ? { trim_start_ms: 0, trim_end_ms: maxClipMs }
        : maxStartMs <= 0
          ? defaultExploreVideoTrim(resolvedFullMs, maxClipMs)
          : slideExploreVideoTrimStart(startMs, resolvedFullMs, maxClipMs),
    [startMs, resolvedFullMs, maxClipMs, maxStartMs],
  );

  useEffect(() => {
    if (!visible || resolvedFullMs <= 0) return;
    player.currentTime = trim.trim_start_ms / 1000;
    player.play();
  }, [visible, resolvedFullMs, trim.trim_start_ms, trim.trim_end_ms, player]);

  useEffect(() => {
    if (!visible || resolvedFullMs <= 0) return;
    const timer = setInterval(() => {
      const endSec = trim.trim_end_ms / 1000;
      if ((player.currentTime || 0) >= endSec - 0.05) {
        player.currentTime = trim.trim_start_ms / 1000;
      }
    }, 200);
    return () => clearInterval(timer);
  }, [visible, resolvedFullMs, player, trim.trim_start_ms, trim.trim_end_ms]);

  if (!visible) return null;

  const ready = resolvedFullMs > 0;

  return (
    <BottomSheet visible={visible} onClose={onCancel} title={ep("trimVideoTitle")} snapHeight="full">
      <Text style={twStyle("text-sm text-gray-600 mb-3")}>{ep("trimVideoHint")}</Text>
      <View
        style={{
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
          <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
        ) : (
          <ActivityIndicator size="large" color="#fff" />
        )}
      </View>
      {ready ? (
        <>
          <View style={twStyle("flex-row justify-between mt-3 mb-1")}>
            <Text style={twStyle("text-xs text-gray-500 tabular-nums")}>{formatSec(trim.trim_start_ms)}</Text>
            <Text style={twStyle("text-xs text-gray-500")}>
              {ep("trimClipLength", { seconds: Math.round(clipMs / 1000) })}
            </Text>
            <Text style={twStyle("text-xs text-gray-500 tabular-nums")}>{formatSec(trim.trim_end_ms)}</Text>
          </View>
          {maxStartMs > 0 ? (
            <Slider
              minimumValue={0}
              maximumValue={maxStartMs}
              step={100}
              value={startMs}
              onValueChange={setStartMs}
              minimumTrackTintColor="#7c3aed"
              maximumTrackTintColor="#e5e7eb"
              accessibilityLabel={ep("trimVideoScrubber")}
            />
          ) : null}
        </>
      ) : (
        <Text style={twStyle("text-sm text-gray-500 mt-3 text-center")}>{ep("trimVideoLoading")}</Text>
      )}
      <View style={twStyle("flex-row gap-2 mt-4")}>
        <ActionButton label={ep("cancel")} variant="secondary" onPress={onCancel} style={twStyle("flex-1")} />
        <ActionButton
          label={ep("trimVideoConfirm")}
          disabled={!ready}
          onPress={() =>
            onConfirm({
              ...trim,
              source_duration_ms: resolvedFullMs,
            })
          }
          style={twStyle("flex-1")}
        />
      </View>
    </BottomSheet>
  );
}
