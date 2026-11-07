/**
 * expo-video's useVideoPlayer releases the native player in an earlier effect
 * cleanup than the component's own effects. Reading currentTime, duration, or
 * playing after that throws ERR_NATIVE_SHARED_OBJECT_NOT_FOUND and takes down
 * the screen (posts reel back-navigation).
 */
export function isReleasedVideoPlayerError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  if (code === "ERR_NATIVE_SHARED_OBJECT_NOT_FOUND") return true;
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    message.includes("ERR_NATIVE_SHARED_OBJECT_NOT_FOUND") ||
    message.includes("Unable to find the native shared object") ||
    message.includes("NativeSharedObjectNotFound")
  );
}

export function withVideoPlayer<T>(read: () => T, fallback: T): T {
  try {
    return read();
  } catch (error) {
    if (isReleasedVideoPlayerError(error)) return fallback;
    throw error;
  }
}

export function runVideoPlayer(command: () => void): void {
  withVideoPlayer(command, undefined);
}
