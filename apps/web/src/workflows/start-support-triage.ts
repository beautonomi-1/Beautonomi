import { isWorkflowFamilyEnabled } from "./config";

/**
 * Start durable support triage when the agent workflow family is enabled;
 * otherwise run the legacy in-process workflow (same behaviour as before).
 */
export async function startSupportTriageForTicket(ticketId: string): Promise<void> {
  if (isWorkflowFamilyEnabled("agent")) {
    try {
      const { start } = await import("workflow/api");
      const { supportTriageWorkflow } = await import("./agents/support-triage.workflow");
      await start(supportTriageWorkflow, [ticketId]);
      return;
    } catch (err) {
      console.error("Workflow support triage start failed; falling back to legacy path:", err);
    }
  }

  const { runSupportTriageWorkflow } = await import("@/lib/agents/workflows/support-agent");
  await runSupportTriageWorkflow({ ticketId });
}
