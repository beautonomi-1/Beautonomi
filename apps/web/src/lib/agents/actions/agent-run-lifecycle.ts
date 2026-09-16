import { getSupabaseAdmin } from "@/lib/supabase/admin";

const STUCK_RUN_THRESHOLD_MINUTES = 45;

/**
 * Mark agent_runs stuck in `running` beyond the threshold as retryable_failure.
 * Called from the workforce sweep cron.
 */
export async function reapStuckAgentRuns(): Promise<number> {
  const supabase = getSupabaseAdmin();
  const cutoff = new Date(Date.now() - STUCK_RUN_THRESHOLD_MINUTES * 60_000).toISOString();

  const { data: stuck, error: selectError } = await supabase
    .from("agent_runs")
    .select("id")
    .eq("status", "running")
    .lt("started_at", cutoff);

  if (selectError || !stuck?.length) return 0;

  const ids = stuck.map((r: { id: string }) => r.id);
  const { error: updateError } = await supabase
    .from("agent_runs")
    .update({
      status: "retryable_failure",
      ended_at: new Date().toISOString(),
      error_class: "stuck_run_reaped",
    })
    .in("id", ids);

  if (updateError) {
    console.warn("[reapStuckAgentRuns] failed:", updateError.message);
    return 0;
  }
  return ids.length;
}

export async function finalizeAgentRun(
  runId: string,
  params: {
    status: "completed" | "retryable_failure" | "permanent_failure";
    escalationCount?: number;
    errorClass?: string;
  },
): Promise<void> {
  const supabase = getSupabaseAdmin();
  await supabase
    .from("agent_runs")
    .update({
      status: params.status,
      ended_at: new Date().toISOString(),
      escalation_count: params.escalationCount ?? 0,
      error_class: params.errorClass ?? null,
    })
    .eq("id", runId);
}
