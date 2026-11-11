import { describe, expect, it, vi } from "vitest";
import { checkPeriodLock, enforcePeriodLock } from "../period-lock";

function supabaseReturning(result: { data: unknown; error: unknown }, opts?: { throws?: Error }) {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    lte: () => chain,
    gte: () => chain,
    limit: () => chain,
    maybeSingle: async () => {
      if (opts?.throws) throw opts.throws;
      return result;
    },
  };
  return { from: vi.fn(() => chain) } as any;
}

describe("checkPeriodLock (F2-50 — fail closed)", () => {
  it("returns unlocked when no lock row matches", async () => {
    const r = await checkPeriodLock(supabaseReturning({ data: null, error: null }), "t1", "2026-08-01");
    expect(r.locked).toBe(false);
  });

  it("returns locked with lock details when a row matches", async () => {
    const r = await checkPeriodLock(
      supabaseReturning({
        data: { id: "lock-1", period_start: "2026-07-01", period_end: "2026-07-31", locked_at: "x", notes: null },
        error: null,
      }),
      "t1",
      "2026-07-15",
    );
    expect(r.locked).toBe(true);
    expect(r.lockId).toBe("lock-1");
  });

  it("still treats a missing table as unlocked (feature not deployed)", async () => {
    const r = await checkPeriodLock(
      supabaseReturning({ data: null, error: { code: "42P01", message: 'relation "financial_period_locks" does not exist' } }),
      "t1",
      "2026-07-15",
    );
    expect(r.locked).toBe(false);
  });

  it("fails closed on any other query error", async () => {
    const r = await checkPeriodLock(
      supabaseReturning({ data: null, error: { code: "57014", message: "statement timeout" } }),
      "t1",
      "2026-07-15",
    );
    expect(r.locked).toBe(true);
    expect(r.error).toMatch(/timeout/);
  });

  it("fails closed when the client throws", async () => {
    const r = await checkPeriodLock(
      supabaseReturning({ data: null, error: null }, { throws: new Error("network down") }),
      "t1",
      "2026-07-15",
    );
    expect(r.locked).toBe(true);
  });

  it("enforcePeriodLock returns a 503 (not 409) when the check itself failed", async () => {
    const res = await enforcePeriodLock(
      supabaseReturning({ data: null, error: { code: "57014", message: "statement timeout" } }),
      "t1",
      "2026-07-15",
    );
    expect(res).not.toBeNull();
    expect(res!.status).toBe(503);
    const body = await res!.json();
    expect(body.error.code).toBe("PERIOD_LOCK_UNAVAILABLE");
  });
});
