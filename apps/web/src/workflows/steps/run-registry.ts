import { FatalError } from "workflow";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { slackNotifyWorkflowFailed } from "@/lib/integrations/slack/ops-triggers";

export type WorkflowRunRegistryRow = {
  id: number;
  runId: string;
};

/**
 * Register a durable run in `workflow_runs`. The partial unique index
 * (workflow, domain_id) WHERE status = 'running' guarantees one active run
 * per domain entity; a conflict is fatal (do not retry).
 */
export async function registerRun(
  workflowRunId: string,
  workflow: string,
  domainType: string,
  domainId: string,
): Promise<WorkflowRunRegistryRow> {
  "use step";

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("workflow_runs")
    .insert({
      run_id: workflowRunId,
      workflow,
      domain_type: domainType,
      domain_id: domainId,
      status: "running",
    })
    .select("id, run_id")
    .single();

  if (error) {
    if (error.code === "23505") {
      // Retry of the same step after a crash between insert and return.
      const { data: existing } = await supabase
        .from("workflow_runs")
        .select("id, run_id")
        .eq("run_id", workflowRunId)
        .maybeSingle();
      if (existing) {
        return { id: existing.id as number, runId: String(existing.run_id) };
      }
      throw new FatalError(`run_already_active:${workflow}:${domainId}`);
    }
    throw new Error(`registerRun(${workflow}): ${error.message}`);
  }
  if (!data) {
    throw new Error(`registerRun(${workflow}): insert_failed`);
  }

  return { id: data.id as number, runId: String(data.run_id) };
}

export async function finishRun(
  registryId: number,
  status: "completed" | "failed" | "cancelled",
  reason?: string,
): Promise<void> {
  "use step";

  const supabase = getSupabaseAdmin();
  const { data: finished, error } = await supabase
    .from("workflow_runs")
    .update({
      status,
      finished_at: new Date().toISOString(),
      error: reason ?? null,
    })
    .eq("id", registryId)
    .select("run_id, workflow, domain_type, domain_id")
    .maybeSingle();

  if (error) {
    throw new Error(`finishRun(${registryId}): ${error.message}`);
  }

  if (status === "failed") {
    const row = finished as {
      run_id?: string;
      workflow?: string;
      domain_type?: string | null;
      domain_id?: string | null;
    } | null;
    slackNotifyWorkflowFailed({
      workflow: row?.workflow ?? "unknown",
      error: reason ?? "workflow failed",
      runId: row?.run_id ?? null,
      domainType: row?.domain_type ?? null,
      domainId: row?.domain_id ?? null,
    });
  }
}
