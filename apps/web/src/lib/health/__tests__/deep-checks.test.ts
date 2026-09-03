import { describe, expect, it, vi } from "vitest";

import {
  HEALTH_CHECK_TIMEOUT_MS,
  paystackKeyProbe,
  runHealthProbe,
  runHealthProbes,
  supabaseProbe,
  upstashProbe,
} from "@/lib/health/deep-checks";

describe("/api/health deep checks", () => {
  it("timeout is 2s per check", () => {
    expect(HEALTH_CHECK_TIMEOUT_MS).toBe(2000);
  });

  it("a hanging probe fails with a timeout instead of blocking", async () => {
    const result = await runHealthProbe(
      { name: "slow", critical: true, run: () => new Promise(() => {}) },
      20,
    );
    expect(result.status).toBe("fail");
    expect(result.detail).toMatch(/timed out after 20ms/);
  });

  it("overall is degraded only when a CRITICAL probe fails; skipped never counts", async () => {
    const report = await runHealthProbes([
      { name: "a", critical: true, run: async () => undefined },
      { name: "b", critical: false, run: async () => { throw new Error("nope"); } },
      { name: "c", critical: true, run: async () => "skipped" as const },
    ]);
    expect(report.status).toBe("ok");
    expect(report.checks.map((c) => c.status)).toEqual(["ok", "fail", "skipped"]);
    expect(report.checks[2].detail).toBe("not configured");

    const degraded = await runHealthProbes([
      { name: "a", critical: true, run: async () => { throw new Error("db down"); } },
    ]);
    expect(degraded.status).toBe("degraded");
    expect(degraded.checks[0].detail).toBe("db down");
  });

  it("supabase probe: skipped without env, ok on clean round-trip, fail on error", async () => {
    const mk = (error: { message: string } | null) => () =>
      ({ from: () => ({ select: () => ({ limit: async () => ({ error }) }) }) }) as never;

    expect(await supabaseProbe(mk(null), {} as NodeJS.ProcessEnv).run()).toBe("skipped");
    const env = { NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k" } as NodeJS.ProcessEnv;
    await expect(supabaseProbe(mk(null), env).run()).resolves.toBeUndefined();
    await expect(supabaseProbe(mk({ message: "relation missing" }), env).run()).rejects.toThrow("relation missing");
    expect(supabaseProbe(mk(null), env).critical).toBe(true);
  });

  it("upstash probe: skipped without env, PONG → ok, anything else → fail", async () => {
    expect(await upstashProbe({} as NodeJS.ProcessEnv).run()).toBe("skipped");
    const env = { UPSTASH_REDIS_REST_URL: "https://r.upstash.io/", UPSTASH_REDIS_REST_TOKEN: "t" } as NodeJS.ProcessEnv;
    const fetchOk = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ result: "PONG" }) })) as never;
    await expect(upstashProbe(env, fetchOk).run()).resolves.toBeUndefined();
    expect((fetchOk as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe("https://r.upstash.io/ping");
    const fetch500 = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })) as never;
    await expect(upstashProbe(env, fetch500).run()).rejects.toThrow("HTTP 500");
    expect(upstashProbe(env).critical).toBe(false);
  });

  it("paystack probe: presence + sk_ format, live key required in production", async () => {
    await expect(paystackKeyProbe({} as NodeJS.ProcessEnv).run()).rejects.toThrow("missing");
    await expect(paystackKeyProbe({ PAYSTACK_SECRET_KEY: "nope" } as NodeJS.ProcessEnv).run()).rejects.toThrow("format");
    await expect(paystackKeyProbe({ PAYSTACK_SECRET_KEY: "sk_test_abc" } as NodeJS.ProcessEnv).run()).resolves.toBeUndefined();
    await expect(
      paystackKeyProbe({ PAYSTACK_SECRET_KEY: "sk_test_abc", VERCEL_ENV: "production" } as NodeJS.ProcessEnv).run(),
    ).rejects.toThrow("live");
    await expect(
      paystackKeyProbe({ PAYSTACK_SECRET_KEY: "sk_live_abc", VERCEL_ENV: "production" } as NodeJS.ProcessEnv).run(),
    ).resolves.toBeUndefined();
  });
});
