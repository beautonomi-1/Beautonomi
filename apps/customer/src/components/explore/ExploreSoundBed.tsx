import { useEffect, useRef } from "react";
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";

/** Catalog track played instead of the clip's own audio. */
export function ExploreSoundBed({
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
