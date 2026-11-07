import { useEffect, useRef } from "react";
import type { VideoPlayer } from "expo-video";
import { runVideoPlayer, withVideoPlayer } from "@/lib/video-player-access";

const TRIM_TICK_MS = 100;
const END_SLACK_SEC = 0.05;
const BEFORE_START_SLACK_SEC = 0.3;

export type UseExploreTrimLoopOptions = {
  /** Reel mode: fire once at trim end instead of seeking back to start. */
  onTrimEnd?: () => void;
};

/**
 * Keeps an expo-video player inside [startMs, endMs] while the source file plays
 * before the encoded clip is delivered. iOS ignores seeks issued before the item
 * is ready, so the first seek waits for `readyToPlay`.
 */
export function useExploreTrimLoop(
  player: VideoPlayer,
  startMs: number | null,
  endMs: number | null,
  active: boolean,
  options?: UseExploreTrimLoopOptions,
) {
  const trimEndFiredRef = useRef(false);
  const playedInsideRef = useRef(false);
  const onTrimEndRef = useRef(options?.onTrimEnd);
  onTrimEndRef.current = options?.onTrimEnd;

  useEffect(() => {
    trimEndFiredRef.current = false;
    playedInsideRef.current = false;
  }, [active, startMs, endMs]);
  useEffect(() => {
    if (!active || startMs == null || endMs == null) return;
    const startSec = startMs / 1000;
    const seekToStart = () => {
      runVideoPlayer(() => {
        player.currentTime = startSec;
      });
    };
    if (withVideoPlayer(() => player.status, "") === "readyToPlay") {
      seekToStart();
      return;
    }
    const sub = player.addListener("statusChange", ({ status }) => {
      if (status !== "readyToPlay") return;
      seekToStart();
      runVideoPlayer(() => sub.remove());
    });
    return () => {
      runVideoPlayer(() => sub.remove());
    };
  }, [active, player, startMs, endMs]);

  useEffect(() => {
    if (!active || startMs == null || endMs == null) return;
    const startSec = startMs / 1000;
    const endSec = endMs / 1000;
    const timer = setInterval(() => {
      const snapshot = withVideoPlayer(() => {
        if (player.status !== "readyToPlay") return null;
        return { t: player.currentTime || 0, playing: Boolean(player.playing) };
      }, null);
      if (!snapshot) return;
      const { t, playing } = snapshot;
      if (t > startSec + 0.2 && t < endSec - END_SLACK_SEC) {
        playedInsideRef.current = true;
      }
      if (t >= endSec - END_SLACK_SEC) {
        const onTrimEnd = onTrimEndRef.current;
        if (onTrimEnd) {
          if (playing) runVideoPlayer(() => player.pause());
          if (playedInsideRef.current && !trimEndFiredRef.current) {
            trimEndFiredRef.current = true;
            onTrimEnd();
          }
          return;
        }
        runVideoPlayer(() => {
          player.currentTime = startSec;
          if (!player.playing) player.play();
        });
        return;
      }
      if (t < startSec - BEFORE_START_SLACK_SEC) {
        runVideoPlayer(() => {
          player.currentTime = startSec;
          if (!player.playing) player.play();
        });
      }
    }, TRIM_TICK_MS);
    return () => clearInterval(timer);
  }, [active, player, startMs, endMs]);
}
