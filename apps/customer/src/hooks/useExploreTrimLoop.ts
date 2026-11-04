import { useEffect } from "react";
import type { VideoPlayer } from "expo-video";

const TRIM_TICK_MS = 100;
const END_SLACK_SEC = 0.05;
const BEFORE_START_SLACK_SEC = 0.3;

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
) {
  useEffect(() => {
    if (startMs == null || endMs == null) return;
    const startSec = startMs / 1000;
    if (player.status === "readyToPlay") {
      player.currentTime = startSec;
      return;
    }
    const sub = player.addListener("statusChange", ({ status }) => {
      if (status !== "readyToPlay") return;
      player.currentTime = startSec;
      sub.remove();
    });
    return () => sub.remove();
  }, [player, startMs, endMs]);

  useEffect(() => {
    if (!active || startMs == null || endMs == null) return;
    const startSec = startMs / 1000;
    const endSec = endMs / 1000;
    const timer = setInterval(() => {
      if (player.status !== "readyToPlay") return;
      const t = player.currentTime || 0;
      if (t >= endSec - END_SLACK_SEC || t < startSec - BEFORE_START_SLACK_SEC) {
        player.currentTime = startSec;
        if (!player.playing) player.play();
      }
    }, TRIM_TICK_MS);
    return () => clearInterval(timer);
  }, [active, player, startMs, endMs]);
}
