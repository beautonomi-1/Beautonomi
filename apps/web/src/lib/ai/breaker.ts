/**
 * Per-model circuit breaker on the shared rate-limit store (Upstash or in-memory fallback).
 */
import { checkRateLimit, type RateLimitConfig } from "@/lib/rate-limit/store";

const FAILURE_THRESHOLD = 5;
const OPEN_WINDOW_SECONDS = 120;

const BREAKER_FAILURE_CONFIG: RateLimitConfig = {
  prefix: "llm:breaker:failures",
  limit: FAILURE_THRESHOLD,
  windowSeconds: 60,
};

const BREAKER_OPEN_CONFIG: RateLimitConfig = {
  prefix: "llm:breaker:open",
  limit: 1,
  windowSeconds: OPEN_WINDOW_SECONDS,
};

type BreakerState = "closed" | "open" | "half_open";

type BreakerEntry = {
  state: BreakerState;
  failures: number;
  openedAt: number;
};

const memoryBreakers = new Map<string, BreakerEntry>();

function breakerKey(modelId: string): string {
  return modelId.replace(/[^a-zA-Z0-9._/-]/g, "_");
}

function getMemoryEntry(key: string): BreakerEntry {
  const existing = memoryBreakers.get(key);
  if (existing) return existing;
  const fresh: BreakerEntry = { state: "closed", failures: 0, openedAt: 0 };
  memoryBreakers.set(key, fresh);
  return fresh;
}

export type BreakerCheckResult = {
  allowed: boolean;
  tripped: boolean;
  state: BreakerState;
};

/** Returns false when the breaker is open (call should failover or fail). */
export async function checkModelBreaker(modelId: string): Promise<BreakerCheckResult> {
  const key = breakerKey(modelId);

  const openCheck = await checkRateLimit(BREAKER_OPEN_CONFIG, key);
  if (!openCheck.allowed) {
    return { allowed: false, tripped: true, state: "open" };
  }

  const entry = getMemoryEntry(key);
  const now = Date.now();
  if (entry.state === "open" && now - entry.openedAt <= OPEN_WINDOW_SECONDS * 1000) {
    return { allowed: false, tripped: true, state: "open" };
  }
  if (entry.state === "open") {
    entry.state = "half_open";
    entry.failures = 0;
  }

  return { allowed: true, tripped: false, state: entry.state === "half_open" ? "half_open" : "closed" };
}

export function recordModelSuccess(modelId: string): void {
  const key = breakerKey(modelId);
  memoryBreakers.set(key, { state: "closed", failures: 0, openedAt: 0 });
  void checkRateLimit({ prefix: "llm:breaker:reset", limit: 1, windowSeconds: 1 }, key);
}

export function recordModelFailure(modelId: string, environment = "production"): void {
  const key = breakerKey(modelId);
  const entry = getMemoryEntry(key);
  entry.failures += 1;

  void (async () => {
    const failResult = await checkRateLimit(BREAKER_FAILURE_CONFIG, key);
    const tripped = !failResult.allowed || entry.state === "half_open" || entry.failures >= FAILURE_THRESHOLD;
    if (tripped) {
      entry.state = "open";
      entry.openedAt = Date.now();
      entry.failures = 0;
      await checkRateLimit(BREAKER_OPEN_CONFIG, key);
      void import("@/lib/ai/alerts").then(({ slackNotifyAiBreakerOpen }) => {
        slackNotifyAiBreakerOpen({ modelId, environment });
      });
    }
  })();
}

export const LLM_PROVIDER_RATE_LIMIT: RateLimitConfig = {
  prefix: "llm:provider",
  limit: 30,
  windowSeconds: 60,
};

export const LLM_TENANT_RATE_LIMIT: RateLimitConfig = {
  prefix: "llm:tenant",
  limit: 200,
  windowSeconds: 60,
};

export async function checkLlmProviderQuota(providerId: string): Promise<boolean> {
  try {
    const result = await checkRateLimit(LLM_PROVIDER_RATE_LIMIT, providerId);
    return result.allowed;
  } catch {
    return true;
  }
}

export async function checkLlmTenantQuota(tenantId: string): Promise<boolean> {
  try {
    const result = await checkRateLimit(LLM_TENANT_RATE_LIMIT, tenantId);
    return result.allowed;
  } catch {
    return true;
  }
}
