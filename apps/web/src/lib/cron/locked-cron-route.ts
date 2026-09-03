import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { withCronLock } from "@/lib/cron/with-cron-lock";

type LockedCronRouteOptions = {
  /** Reclaim a stuck run after this many minutes (default 30). */
  staleAfterMinutes?: number;
};

/**
 * Wrap a cron route body in `withCronLock` (single-flight guard + `cron_runs` history)
 * without changing the route's own auth, error handling, or response shapes.
 *
 * - `skipped` (another invocation still running) → 200 `{ ok: true, skipped: true, reason }`.
 * - Body throws → `cron_runs` row marked failed, then the ORIGINAL error is rethrown so
 *   the route's own try/catch (or Next's default 500) formats the response as before.
 * - Body returns a 5xx `Response` (routes that catch their own errors) → the run is
 *   recorded as failed but the ORIGINAL response is returned unchanged.
 * - Otherwise the body's `Response` is returned as-is.
 *
 * Call this AFTER `verifyCronRequest` so unauthenticated hits never touch the lock.
 */
export async function runLockedCronRoute(
  jobName: string,
  fn: () => Promise<Response>,
  options?: LockedCronRouteOptions,
): Promise<Response> {
  const supabase = getSupabaseAdmin();
  let capturedErrorResponse: Response | null = null;
  let capturedError: unknown = null;

  const outcome = await withCronLock(
    supabase,
    jobName,
    async () => {
      let response: Response;
      try {
        response = await fn();
      } catch (err) {
        capturedError = err;
        throw err;
      }
      if (response.status >= 500) {
        capturedErrorResponse = response;
        throw new Error(`cron route returned HTTP ${response.status}`);
      }
      return response;
    },
    options,
  );

  if (outcome.status === "skipped") {
    return NextResponse.json(
      { ok: true, skipped: true, reason: outcome.reason, job: jobName },
      { status: 200 },
    );
  }
  if (outcome.status === "failed") {
    if (capturedErrorResponse) return capturedErrorResponse;
    if (capturedError) throw capturedError;
    return NextResponse.json({ ok: false, error: outcome.error, job: jobName }, { status: 500 });
  }
  return outcome.result;
}
