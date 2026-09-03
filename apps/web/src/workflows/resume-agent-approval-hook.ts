/**
 * Resume a workflow approval hook after an admin approve/reject decision.
 * Legacy-path actions have no hook, and a hook may not be registered yet if
 * the reviewer decided before the run suspended — both are swallowed; the
 * workflow re-reads the action row on timeout, so the decision is not lost.
 */
export async function resumeAgentApprovalHook(
  actionId: string,
  decision: "approve" | "reject",
): Promise<void> {
  try {
    const { resumeHook } = await import("workflow/api");
    await resumeHook(`agent-approval:${actionId}`, { decision });
  } catch (err) {
    const { HookNotFoundError } = await import("workflow/errors");
    if (HookNotFoundError.is(err)) return;
    console.error(`resumeAgentApprovalHook(${actionId}):`, err);
  }
}
