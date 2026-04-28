/**
 * Countdown for booking holds. Uses a clock offset from server `server_now` so
 * display matches API expiry checks when the device clock is skewed.
 */
export function serverNowToClockOffsetMs(
  serverNowIso: string | null | undefined
): number {
  if (typeof serverNowIso !== "string" || !serverNowIso.trim()) {
    return 0;
  }
  const serverT = new Date(serverNowIso).getTime();
  if (!Number.isFinite(serverT)) {
    return 0;
  }
  return serverT - Date.now();
}

export function getHoldTimeRemaining(
  expiresAt: string,
  clockOffsetMs = 0
): { minutes: number; seconds: number; expired: boolean } {
  const now = Date.now() + clockOffsetMs;
  const end = new Date(expiresAt).getTime();
  const diff = end - now;
  if (!Number.isFinite(diff) || diff <= 0) {
    return { minutes: 0, seconds: 0, expired: true };
  }
  const totalSeconds = Math.floor(diff / 1000);
  return {
    minutes: Math.floor(totalSeconds / 60),
    seconds: totalSeconds % 60,
    expired: false,
  };
}
