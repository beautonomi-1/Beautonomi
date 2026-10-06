"use client";

import { useEffect, useState } from "react";

export function useRateLimitCooldown(untilMs: number | null): number {
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (!untilMs) {
      setSecondsLeft(0);
      return;
    }
    const tick = () => {
      const left = Math.max(0, Math.ceil((untilMs - Date.now()) / 1000));
      setSecondsLeft(left);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [untilMs]);

  return secondsLeft;
}

export function rateLimitUntilFromError(err: unknown): number | null {
  if (err && typeof err === "object") {
    if ("retryAfterSeconds" in err && typeof (err as { retryAfterSeconds?: number }).retryAfterSeconds === "number") {
      const s = (err as { retryAfterSeconds: number }).retryAfterSeconds;
      return Date.now() + s * 1000;
    }
    if (err instanceof Error && err.name === "AuthRateLimitError") {
      const s = (err as Error & { retryAfterSeconds?: number }).retryAfterSeconds ?? 60;
      return Date.now() + s * 1000;
    }
  }
  return null;
}
