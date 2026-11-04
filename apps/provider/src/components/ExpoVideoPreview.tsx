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
  paused?: boolean;
  muted?: boolean;
  /** Seek once when the source loads (e.g. trim start for thumbnails). */
  startAtMs?: number;
};

export function ExpoVideoPreview({
  uri,
  style,
  contentFit = "cover",
  nativeControls = false,
  loop = false,
  paused = true,
  muted = false,
  startAtMs,
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
    if (startAtMs == null || !Number.isFinite(startAtMs)) return;
    player.currentTime = startAtMs / 1000;
    player.pause();
  }, [startAtMs, player, uri]);

  useEffect(() => {
    if (paused) {
      player.pause();
    } else {
      player.play();
    }
  }, [paused, player]);

  return (
    <VideoView
      player={player}
      style={style}
      nativeControls={nativeControls}
      contentFit={contentFit}
    />
  );
}
