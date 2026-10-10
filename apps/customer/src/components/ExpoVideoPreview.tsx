import { useEffect } from "react";
import { StyleProp, ViewStyle } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";

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
  /** Fired ~5×/s while playing (for timed on-media text overlays). */
  onPlaybackTimeUpdate?: (timeMs: number) => void;
};

export function ExpoVideoPreview({
  uri,
  style,
  contentFit = "cover",
  nativeControls = false,
  loop = false,
  paused = true,
  muted = false,
  onPlaybackTimeUpdate,
}: ExpoVideoPreviewProps) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = loop;
    p.muted = muted;
    if (paused) {
      p.pause();
    } else {
      p.play();
    }
  });

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
      onPlaybackTimeUpdate(Math.floor((player.currentTime || 0) * 1000));
    }, 200);
    return () => clearInterval(timer);
  }, [paused, player, onPlaybackTimeUpdate]);

  return (
    <VideoView
      player={player}
      style={style}
      nativeControls={nativeControls}
      contentFit={contentFit}
    />
  );
}
