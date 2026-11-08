export type CancelableHandle = { cancel: () => void };

type IdleCallbackDeadline = { didTimeout: boolean; timeRemaining: () => number };

type RequestIdleCallback = (
  cb: (deadline: IdleCallbackDeadline) => void,
  options?: { timeout?: number },
) => number;

type CancelIdleCallback = (handle: number) => void;

/**
 * Lightweight replacement for React Native's deprecated `InteractionManager.runAfterInteractions`.
 *
 * Semantics:
 * - Schedules `task` "soon, but not immediately" (prefer idle time; otherwise next frame / timeout).
 * - Returns a cancelable handle so callers can stop work when a component unmounts.
 *
 * Works in:
 * - React Native (uses `requestAnimationFrame` fallback)
 * - Web / JS runtimes that support `requestIdleCallback`
 * - Jest/Node (falls back to `setTimeout`)
 */
export function runAfterInteractions(task: () => void, opts?: { timeoutMs?: number }): CancelableHandle {
  let cancelled = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let rafId: number | null = null;
  let idleId: number | null = null;

  const cancel = () => {
    cancelled = true;
    if (timeoutId != null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    if (rafId != null && typeof (globalThis as any).cancelAnimationFrame === "function") {
      (globalThis as any).cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (idleId != null && typeof (globalThis as any).cancelIdleCallback === "function") {
      (globalThis as any as { cancelIdleCallback: CancelIdleCallback }).cancelIdleCallback(idleId);
      idleId = null;
    }
  };

  const run = () => {
    if (cancelled) return;
    try {
      task();
    } catch (e) {
      // Preserve old InteractionManager behavior: exceptions escape async boundary.
      // Re-throw on a macrotask so it surfaces as an unhandled error.
      timeoutId = setTimeout(() => {
        throw e;
      }, 0);
    }
  };

  const scheduleMacrotask = () => {
    timeoutId = setTimeout(run, 0);
  };

  const ric = (globalThis as any).requestIdleCallback as RequestIdleCallback | undefined;
  const hasRic =
    typeof ric === "function" && typeof (globalThis as any).cancelIdleCallback === "function";
  if (hasRic) {
    idleId = ric(
      () => {
        // Ensure we yield at least one macrotask so heavy work never blocks the
        // current render/commit phase.
        scheduleMacrotask();
      },
      { timeout: Math.max(0, opts?.timeoutMs ?? 750) },
    );
    return { cancel };
  }

  const raf = (globalThis as any).requestAnimationFrame as ((cb: (t: number) => void) => number) | undefined;
  if (typeof raf === "function") {
    rafId = raf(() => {
      scheduleMacrotask();
    });
    return { cancel };
  }

  scheduleMacrotask();
  return { cancel };
}

