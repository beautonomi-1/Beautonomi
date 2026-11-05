import { useEffect } from "react";
import { StyleProp, ViewStyle } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import type { ExplorePlaybackTrimWindow } from "@/lib/explore-video-playback-trim";
import { useExploreTrimLoop } from "@/hooks/useExploreTrimLoop";

type ContentFit = "cover" | "contain" | "fill";

type ExpoVideoPreviewProps = {
  uri: string;
  style?: StyleProp<ViewStyle>;
  contentFit?: ContentFit;
  nativeControls?: boolean;
  loop?: boolean;
  /** When true, playback is paused (e.g. off-screen carousel slide). */
  paused?: boolean;
  muted?: boolean;
  /** Client trim window while waiting for encoded playback. */
  playbackTrim?: ExplorePlaybackTrimWindow | null;
  /** Fired ~5×/s while playing (for timed on-media text overlays). */
  onPlaybackTimeUpdate?: (timeMs: number) => void;
  onPlayingChange?: (playing: boolean) => void;
};

export function ExpoVideoPreview({
  uri,
  style,
  contentFit = "cover",
  nativeControls = false,
  loop = false,
  paused = true,
  muted = false,
  playbackTrim = null,
  onPlaybackTimeUpdate,
  onPlayingChange,
}: ExpoVideoPreviewProps) {
  const trimStartMs = playbackTrim?.trim_start_ms ?? null;
  const trimEndMs = playbackTrim?.trim_end_ms ?? null;
  const hasTrim = trimStartMs != null && trimEndMs != null;

  const player = useVideoPlayer(uri, (p) => {
    p.loop = hasTrim ? false : loop;
    p.muted = muted;
    if (paused) {
      p.pause();
    } else {
      p.play();
    }
  });

  useExploreTrimLoop(player, trimStartMs, trimEndMs, !paused);

  useEffect(() => {
    if (!onPlayingChange) return;
    const sub = player.addListener("playingChange", ({ isPlaying }) => onPlayingChange(isPlaying));
    return () => sub.remove();
  }, [onPlayingChange, player]);

  useEffect(() => {
    player.muted = muted;
    if (paused) {
      player.pause();
    } else {
      player.play();
    }
  }, [paused, muted, player]);

  useEffect(() => {
    if (paused || !onPlaybackTimeUpdate) return;
    const timer = setInterval(() => {
      const ms = Math.floor((player.currentTime || 0) * 1000);
      onPlaybackTimeUpdate(trimStartMs != null ? Math.max(0, ms - trimStartMs) : ms);
    }, 200);
    return () => clearInterval(timer);
  }, [paused, player, onPlaybackTimeUpdate, trimStartMs]);

  return (
    <VideoView
      player={player}
      style={style}
      nativeControls={nativeControls}
      contentFit={contentFit}
    />
  );
}
