import { randomUUID } from "node:crypto";
import { evaluateAgentAuthz, resolveRiskTier, type AuthzContext } from "@beautonomi/agent-policy";
import type { AgentToolDefinition, ToolExecutionResult } from "./types";

export async function executeTool<I, O>(
  tool: AgentToolDefinition<I, O>,
  ctx: AuthzContext,
  rawInput: unknown,
): Promise<ToolExecutionResult<O>> {
  const parsed = tool.inputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: `input_schema_invalid: ${parsed.error.message}` };
  }
  const input = parsed.data;
  const resolvedRisk =
    tool.riskTier?.(ctx.principal, input) ?? resolveRiskTier(tool.baseRiskTier);
  const authz = evaluateAgentAuthz({ ...ctx, resolvedRiskTier: resolvedRisk }, tool.mode);
  if (!authz.allowed) {
    return { ok: false, error: authz.reason, policyDenied: true };
  }
  const toolCallId = randomUUID();
  try {
    const output = await Promise.race([
      tool.execute(ctx.principal, input),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("tool_timeout")), tool.timeoutMs),
      ),
    ]);
    const validated = tool.outputSchema.safeParse(output);
    if (!validated.success) {
      return { ok: false, error: `output_schema_invalid: ${validated.error.message}` };
    }
    return { ok: true, output: validated.data, toolCallId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "tool_error" };
  }
}
