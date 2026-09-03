/**
 * /api/health deep checks (Part O). Each check is bounded by a 2s timeout so the
 * endpoint stays fast for uptime probes and the post-deploy smoke step.
 *
 * Pure orchestration with injected probes so it can be unit-tested; the route wires
 * in the real Supabase admin client / Upstash REST ping / env presence.
 */

export const HEALTH_CHECK_TIMEOUT_MS = 2000;

export type HealthCheckStatus = "ok" | "fail" | "skipped";

export type HealthCheckResult = {
  name: string;
  status: HealthCheckStatus;
  latency_ms: number;
  detail?: string;
};

export type HealthProbe = {
  name: string;
  /** Whether this probe counts toward the overall status. Skipped probes never do. */
  critical: boolean;
  /** Resolve → ok; reject/throw → fail; return `"skipped"` → not configured. */
  run: () => Promise<void | "skipped">;
};

export type HealthReport = {
  status: "ok" | "degraded";
  timestamp: string;
  checks: HealthCheckResult[];
  release?: string | null;
};

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}

export async function runHealthProbe(
  probe: HealthProbe,
  timeoutMs: number = HEALTH_CHECK_TIMEOUT_MS,
): Promise<HealthCheckResult> {
  const startedAt = Date.now();
  try {
    const outcome = await withTimeout(probe.run(), timeoutMs, probe.name);
    return {
      name: probe.name,
      status: outcome === "skipped" ? "skipped" : "ok",
      latency_ms: Date.now() - startedAt,
      ...(outcome === "skipped" ? { detail: "not configured" } : {}),
    };
  } catch (err) {
    return {
      name: probe.name,
      status: "fail",
      latency_ms: Date.now() - startedAt,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Run all probes in parallel; overall is `degraded` iff any CRITICAL probe failed. */
export async function runHealthProbes(
  probes: HealthProbe[],
  options?: { timeoutMs?: number; release?: string | null },
): Promise<HealthReport> {
  const results = await Promise.all(probes.map((p) => runHealthProbe(p, options?.timeoutMs)));
  const criticalFailed = probes.some(
    (p, i) => p.critical && results[i].status === "fail",
  );
  return {
    status: criticalFailed ? "degraded" : "ok",
    timestamp: new Date().toISOString(),
    checks: results,
    release: options?.release ?? null,
  };
}

// ── Concrete probes ──────────────────────────────────────────────────────────

type MinimalSupabase = {
  from: (table: string) => {
    select: (cols: string, opts?: { head?: boolean; count?: "exact" | "planned" | "estimated" }) => {
      limit: (n: number) => PromiseLike<{ error: { message: string } | null }>;
    };
  };
};

/** Supabase: `select 1`-equivalent via a HEAD count on a tiny always-present table. */
export function supabaseProbe(getClient: () => MinimalSupabase, env: NodeJS.ProcessEnv = process.env): HealthProbe {
  return {
    name: "supabase",
    critical: true,
    run: async () => {
      if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return "skipped";
      const { error } = await getClient()
        .from("platform_settings")
        .select("id", { head: true, count: "planned" })
        .limit(1);
      if (error) throw new Error(error.message);
    },
  };
}

/** Upstash: REST `PING` when configured. */
export function upstashProbe(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): HealthProbe {
  return {
    name: "upstash",
    critical: false,
    run: async () => {
      const url = env.UPSTASH_REDIS_REST_URL;
      const token = env.UPSTASH_REDIS_REST_TOKEN;
      if (!url || !token) return "skipped";
      const res = await fetchImpl(`${url.replace(/\/+$/, "")}/ping`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`upstash ping HTTP ${res.status}`);
      const body = (await res.json().catch(() => null)) as { result?: unknown } | null;
      if (!body || String(body.result).toUpperCase() !== "PONG") {
        throw new Error("upstash ping did not return PONG");
      }
    },
  };
}

/** Paystack: key presence + shape (sk_live in production). No network call. */
export function paystackKeyProbe(env: NodeJS.ProcessEnv = process.env): HealthProbe {
  return {
    name: "paystack",
    critical: true,
    run: async () => {
      const key = env.PAYSTACK_SECRET_KEY;
      if (!key) throw new Error("PAYSTACK_SECRET_KEY missing");
      if (!/^sk_(live|test)_/.test(key)) throw new Error("PAYSTACK_SECRET_KEY has unexpected format");
      if (env.VERCEL_ENV === "production" && !key.startsWith("sk_live_")) {
        throw new Error("production is not using a live Paystack key");
      }
    },
  };
}
