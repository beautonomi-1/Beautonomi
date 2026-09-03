import { beforeEach, describe, expect, it, vi } from "vitest";

const slackNotifyCronJobFailed = vi.fn();
vi.mock("@/lib/integrations/slack/ops-triggers", () => ({
  slackNotifyCronJobFailed: (...args: unknown[]) => slackNotifyCronJobFailed(...args),
}));

const getSupabaseAdmin = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => getSupabaseAdmin(),
}));

import { withCronLock } from "@/lib/cron/with-cron-lock";
import { runLockedCronRoute } from "@/lib/cron/locked-cron-route";

type RpcCall = [string, Record<string, unknown>];

function makeSupabase(claimResult: { data: unknown; error: { message: string } | null }) {
  const rpc = vi.fn(async (name: string) => {
    if (name === "claim_cron_run") return claimResult;
    if (name === "finish_cron_run") return { data: null, error: null };
    throw new Error(`unexpected rpc ${name}`);
  });
  return { rpc };
}

const finishCalls = (rpc: ReturnType<typeof vi.fn>): RpcCall[] =>
  (rpc.mock.calls as RpcCall[]).filter(([name]) => name === "finish_cron_run");

describe("withCronLock", () => {
  beforeEach(() => {
    slackNotifyCronJobFailed.mockReset();
  });

  it("not acquired → job skipped, fn never runs, finish_cron_run never called", async () => {
    const supabase = makeSupabase({ data: null, error: null });
    const fn = vi.fn(async () => "ran");
    const outcome = await withCronLock(supabase as never, "job-a", fn);
    expect(outcome).toEqual({ status: "skipped", reason: "already_running" });
    expect(fn).not.toHaveBeenCalled();
    expect(finishCalls(supabase.rpc)).toHaveLength(0);
    expect(supabase.rpc).toHaveBeenCalledWith("claim_cron_run", {
      p_job_name: "job-a",
      p_stale_after_minutes: 30,
    });
  });

  it("acquired → job runs once and finish_cron_run is called exactly once with completed", async () => {
    const supabase = makeSupabase({ data: 42, error: null });
    const fn = vi.fn(async () => ({ processed: 3 }));
    const outcome = await withCronLock(supabase as never, "job-b", fn, { staleAfterMinutes: 5 });
    expect(outcome).toEqual({ status: "completed", runId: 42, result: { processed: 3 } });
    expect(fn).toHaveBeenCalledTimes(1);
    const finishes = finishCalls(supabase.rpc);
    expect(finishes).toHaveLength(1);
    expect(finishes[0][1]).toMatchObject({ p_run_id: 42, p_status: "completed", p_error: null });
    expect(supabase.rpc).toHaveBeenCalledWith("claim_cron_run", {
      p_job_name: "job-b",
      p_stale_after_minutes: 5,
    });
    expect(slackNotifyCronJobFailed).not.toHaveBeenCalled();
  });

  it("job throws → finish_cron_run called once with failed + message; outcome is failed (not rethrown); Slack notified", async () => {
    const supabase = makeSupabase({ data: "7", error: null });
    const outcome = await withCronLock(supabase as never, "job-c", async () => {
      throw new Error("kaboom");
    });
    expect(outcome).toEqual({ status: "failed", runId: 7, error: "kaboom" });
    const finishes = finishCalls(supabase.rpc);
    expect(finishes).toHaveLength(1);
    expect(finishes[0][1]).toMatchObject({ p_run_id: 7, p_status: "failed", p_error: "kaboom" });
    expect(slackNotifyCronJobFailed).toHaveBeenCalledWith({ cronJob: "job-c", error: "kaboom", runId: 7 });
  });

  it("claim RPC error → throws (lock infrastructure failure is loud)", async () => {
    const supabase = makeSupabase({ data: null, error: { message: "db offline" } });
    await expect(withCronLock(supabase as never, "job-d", async () => 1)).rejects.toThrow(
      "claim_cron_run failed: db offline",
    );
    expect(finishCalls(supabase.rpc)).toHaveLength(0);
  });
});

describe("runLockedCronRoute (route wrapper used by every owned cron route)", () => {
  beforeEach(() => {
    slackNotifyCronJobFailed.mockReset();
  });

  it("skipped → 200 { ok, skipped: true }", async () => {
    getSupabaseAdmin.mockReturnValue(makeSupabase({ data: null, error: null }));
    const body = vi.fn(async () => new Response("x"));
    const res = await runLockedCronRoute("job", body);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, skipped: true, job: "job", reason: "already_running" });
    expect(body).not.toHaveBeenCalled();
  });

  it("completed → the body's own Response is returned untouched", async () => {
    const supabase = makeSupabase({ data: 1, error: null });
    getSupabaseAdmin.mockReturnValue(supabase);
    const res = await runLockedCronRoute("job", async () => Response.json({ done: true }, { status: 201 }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ done: true });
    expect(finishCalls(supabase.rpc)[0][1]).toMatchObject({ p_status: "completed" });
  });

  it("body returns 5xx → run recorded failed, ORIGINAL response preserved", async () => {
    const supabase = makeSupabase({ data: 1, error: null });
    getSupabaseAdmin.mockReturnValue(supabase);
    const res = await runLockedCronRoute("job", async () => Response.json({ error: "custom" }, { status: 500 }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "custom" });
    expect(finishCalls(supabase.rpc)[0][1]).toMatchObject({ p_status: "failed" });
  });

  it("body throws → run recorded failed and the ORIGINAL error is rethrown for the route's catch", async () => {
    const supabase = makeSupabase({ data: 1, error: null });
    getSupabaseAdmin.mockReturnValue(supabase);
    const boom = new Error("boom");
    await expect(
      runLockedCronRoute("job", async () => {
        throw boom;
      }),
    ).rejects.toBe(boom);
    expect(finishCalls(supabase.rpc)[0][1]).toMatchObject({ p_status: "failed", p_error: "boom" });
  });
});
