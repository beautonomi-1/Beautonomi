import type { SupabaseClient } from "@supabase/supabase-js";
import { slackNotifyCronJobFailed } from "@/lib/integrations/slack/ops-triggers";

export type CronLockOutcome<T> =
  | { status: "completed"; runId: number; result: T }
  | { status: "skipped"; reason: string }
  | { status: "failed"; runId: number; error: string };

type CronLockOptions = {
  /** Reclaim a stuck run after this many minutes (default 30). */
  staleAfterMinutes?: number;
};

/**
 * Acquire a per-job cron lock via cron_runs, run fn, then record completion.
 * Returns skipped when another invocation is still running.
 */
export async function withCronLock<T>(
  supabase: SupabaseClient,
  jobName: string,
  fn: () => Promise<T>,
  options?: CronLockOptions,
): Promise<CronLockOutcome<T>> {
  const staleAfterMinutes = options?.staleAfterMinutes ?? 30;

  const { data: runId, error: claimError } = await supabase.rpc("claim_cron_run", {
    p_job_name: jobName,
    p_stale_after_minutes: staleAfterMinutes,
  });

  if (claimError) {
    throw new Error(`claim_cron_run failed: ${claimError.message}`);
  }

  if (runId == null) {
    return { status: "skipped", reason: "already_running" };
  }

  const numericRunId = Number(runId);

  try {
    const result = await fn();
    await supabase.rpc("finish_cron_run", {
      p_run_id: numericRunId,
      p_status: "completed",
      p_summary: null,
      p_error: null,
    });
    return { status: "completed", runId: numericRunId, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase.rpc("finish_cron_run", {
      p_run_id: numericRunId,
      p_status: "failed",
      p_summary: null,
      p_error: message,
    });
    // Slack `ops.cron.failed` — deduped per job per hour inside the trigger; never throws.
    try {
      slackNotifyCronJobFailed({ cronJob: jobName, error: message, runId: numericRunId });
    } catch (notifyErr) {
      console.error("[withCronLock] slack notify failed:", notifyErr);
    }
    return { status: "failed", runId: numericRunId, error: message };
  }
}
