import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetSupabaseAdmin = vi.fn();
const mockCallGemini = vi.fn();
const mockEstimateCostUsd = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => mockGetSupabaseAdmin() }));
vi.mock("@/lib/ai/gemini", () => ({ callGemini: (...args: unknown[]) => mockCallGemini(...args) }));
vi.mock("@/lib/ai/pricing", () => ({ estimateCostUsd: (...args: unknown[]) => mockEstimateCostUsd(...args) }));

import { callAgentLlm } from "../llm";

type Tables = {
  geminiConfig: unknown;
  run: { total_tokens_in: number; total_tokens_out: number; total_cost_usd: number } | null;
  lastStepSeq: number | null;
};

function buildSupabase(t: Tables) {
  const stepInsert = vi.fn().mockResolvedValue({ error: null });
  const runUpdateEq = vi.fn().mockResolvedValue({ error: null });
  const runUpdate = vi.fn(() => ({ eq: runUpdateEq }));

  const from = vi.fn((table: string) => {
    if (table === "gemini_integration_config") {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: t.geminiConfig, error: null }),
      };
    }
    if (table === "agent_steps") {
      return {
        insert: stepInsert,
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: t.lastStepSeq == null ? null : { seq: t.lastStepSeq }, error: null }),
      };
    }
    if (table === "agent_runs") {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: t.run, error: null }),
        update: runUpdate,
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
  return { client: { from }, stepInsert, runUpdate, runUpdateEq };
}

describe("callAgentLlm token rollup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEstimateCostUsd.mockResolvedValue(0.0012);
  });

  it("writes an agent_steps model row and increments agent_runs totals when runId is provided", async () => {
    const sb = buildSupabase({
      geminiConfig: { api_key_secret: "k", default_model: "gemini-2.5-flash" },
      run: { total_tokens_in: 100, total_tokens_out: 40, total_cost_usd: 0.001 },
      lastStepSeq: 2,
    });
    mockGetSupabaseAdmin.mockReturnValue(sb.client);
    mockCallGemini.mockResolvedValue({ success: true, text: "{\"ok\":true}", tokensIn: 500, tokensOut: 200 });

    const result = await callAgentLlm({
      system: "s",
      user: "u",
      schema: { type: "object" },
      runId: "run-1",
      promptVersion: "support-triage:v1",
    });

    expect(result).toMatchObject({ configured: true, success: true, model: "gemini-2.5-flash", tokensIn: 500, tokensOut: 200, costUsd: 0.0012 });
    expect(mockEstimateCostUsd).toHaveBeenCalledWith("gemini-2.5-flash", 500, 200);

    expect(sb.stepInsert).toHaveBeenCalledTimes(1);
    expect(sb.stepInsert.mock.calls[0][0]).toMatchObject({
      run_id: "run-1",
      seq: 3,
      kind: "model",
      model_provider: "gemini",
      model_id: "gemini-2.5-flash",
      prompt_version: "support-triage:v1",
      tokens_in: 500,
      tokens_out: 200,
      cost_usd: 0.0012,
      schema_valid: true,
      error: null,
    });

    expect(sb.runUpdate).toHaveBeenCalledTimes(1);
    expect(sb.runUpdate.mock.calls[0][0]).toEqual({
      total_tokens_in: 600,
      total_tokens_out: 240,
      total_cost_usd: 0.0022,
    });
    expect(sb.runUpdateEq).toHaveBeenCalledWith("id", "run-1");
  });

  it("records failed calls as steps with an error and still returns success:false", async () => {
    const sb = buildSupabase({
      geminiConfig: { api_key_secret: "k", default_model: null },
      run: null,
      lastStepSeq: null,
    });
    mockGetSupabaseAdmin.mockReturnValue(sb.client);
    mockEstimateCostUsd.mockResolvedValue(0);
    mockCallGemini.mockResolvedValue({ success: false, errorCode: "GEMINI_TIMEOUT", text: "", tokensIn: 0, tokensOut: 0 });

    const result = await callAgentLlm({ system: "s", user: "u", runId: "run-2", schema: { type: "object" } });
    expect(result).toEqual({ configured: true, success: false, errorCode: "GEMINI_TIMEOUT" });
    expect(sb.stepInsert.mock.calls[0][0]).toMatchObject({ seq: 1, model_id: "gemini-2.0-flash", error: "GEMINI_TIMEOUT", schema_valid: false });
  });

  it("does not touch agent_steps / agent_runs without a runId", async () => {
    const sb = buildSupabase({ geminiConfig: { api_key_secret: "k" }, run: null, lastStepSeq: null });
    mockGetSupabaseAdmin.mockReturnValue(sb.client);
    mockCallGemini.mockResolvedValue({ success: true, text: "hi", tokensIn: 1, tokensOut: 1 });

    await callAgentLlm({ system: "s", user: "u" });
    expect(sb.stepInsert).not.toHaveBeenCalled();
    expect(sb.runUpdate).not.toHaveBeenCalled();
  });

  it("returns configured:false when Gemini is not configured", async () => {
    const sb = buildSupabase({ geminiConfig: null, run: null, lastStepSeq: null });
    mockGetSupabaseAdmin.mockReturnValue(sb.client);
    expect(await callAgentLlm({ system: "s", user: "u", runId: "r" })).toEqual({ configured: false });
    expect(mockCallGemini).not.toHaveBeenCalled();
  });
});
