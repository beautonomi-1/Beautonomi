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
};

export function ExpoVideoPreview({
  uri,
  style,
  contentFit = "cover",
  nativeControls = false,
  loop = false,
  paused = true,
  muted = false,
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
