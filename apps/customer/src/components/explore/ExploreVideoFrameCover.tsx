import { useEffect, useState } from "react";
import { View } from "react-native";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView, type VideoThumbnail } from "expo-video";
import { isReleasedVideoPlayerError, runVideoPlayer, withVideoPlayer } from "@/lib/video-player-access";

const COVER_FRAME_SEC = 0.1;

/**
 * Still frame from a video that has no poster JPEG. The web feed shows the
 * same file at 0.1s; this grabs that frame once and paints it as an image.
 */
export function ExploreVideoFrameCover({
  uri,
  width,
  height,
}: {
  uri: string;
  width: number;
  height: number;
}) {
  const [thumb, setThumb] = useState<VideoThumbnail | null>(null);
  const [usePlayerFrame, setUsePlayerFrame] = useState(false);
  const player = useVideoPlayer(uri, (p) => {
    p.muted = true;
    p.loop = false;
    p.pause();
  });

  useEffect(() => {
    let cancelled = false;
    const grab = () => {
      const maxWidth = Math.max(1, Math.round(width * 2));
      void player
        .generateThumbnailsAsync(COVER_FRAME_SEC, { maxWidth })
        .then((frames) => {
          if (cancelled) return;
          if (frames[0]) setThumb(frames[0]);
          else setUsePlayerFrame(true);
        })
        .catch((error: unknown) => {
          if (cancelled || isReleasedVideoPlayerError(error)) return;
          runVideoPlayer(() => {
            player.currentTime = COVER_FRAME_SEC;
            player.pause();
          });
          setUsePlayerFrame(true);
        });
    };
    if (withVideoPlayer(() => player.status, "") === "readyToPlay") {
      grab();
      return () => {
        cancelled = true;
      };
    }
    const sub = player.addListener("statusChange", ({ status }) => {
      if (status !== "readyToPlay") return;
      grab();
      sub.remove();
    });
    return () => {
      cancelled = true;
      try {
        sub.remove();
      } catch (error) {
        if (!isReleasedVideoPlayerError(error)) throw error;
      }
    };
  }, [player, width]);

  return (
    <View pointerEvents="none" style={{ width, height, backgroundColor: "#111" }}>
      {thumb ? (
        <Image source={thumb} style={{ width, height }} contentFit="cover" />
      ) : usePlayerFrame ? (
        <VideoView player={player} style={{ width, height }} contentFit="cover" nativeControls={false} />
      ) : null}
    </View>
  );
}
