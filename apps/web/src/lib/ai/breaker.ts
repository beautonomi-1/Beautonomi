/**
 * Per-model circuit breaker on the shared rate-limit store (Upstash or in-memory fallback).
 */
import { checkRateLimit, type RateLimitConfig } from "@/lib/rate-limit/store";

const FAILURE_THRESHOLD = 5;
const OPEN_WINDOW_SECONDS = 120;
const HALF_OPEN_PROBE_SECONDS = 30;

type BreakerState = "closed" | "open" | "half_open";

type BreakerEntry = {
  state: BreakerState;
  failures: number;
  openedAt: number;
  lastFailureAt: number;
};

const memoryBreakers = new Map<string, BreakerEntry>();

function breakerKey(modelId: string): string {
  return modelId.replace(/[^a-zA-Z0-9._/-]/g, "_");
}

function getEntry(key: string): BreakerEntry {
  const existing = memoryBreakers.get(key);
  if (existing) return existing;
  const fresh: BreakerEntry = { state: "closed", failures: 0, openedAt: 0, lastFailureAt: 0 };
  memoryBreakers.set(key, fresh);
  return fresh;
}

export type BreakerCheckResult = {
  allowed: boolean;
  tripped: boolean;
  state: BreakerState;
};

/** Returns false when the breaker is open (call should failover or fail). */
export function checkModelBreaker(modelId: string): BreakerCheckResult {
  const key = breakerKey(modelId);
  const entry = getEntry(key);
  const now = Date.now();

  if (entry.state === "open") {
    if (now - entry.openedAt > OPEN_WINDOW_SECONDS * 1000) {
      entry.state = "half_open";
      entry.failures = 0;
    } else {
      return { allowed: false, tripped: true, state: "open" };
    }
  }

  if (entry.state === "half_open") {
    return { allowed: true, tripped: false, state: "half_open" };
  }

  return { allowed: true, tripped: false, state: "closed" };
}

export function recordModelSuccess(modelId: string): void {
  const key = breakerKey(modelId);
  memoryBreakers.set(key, { state: "closed", failures: 0, openedAt: 0, lastFailureAt: 0 });
}

export function recordModelFailure(modelId: string, environment = "production"): void {
  const key = breakerKey(modelId);
  const entry = getEntry(key);
  const now = Date.now();
  entry.failures += 1;
  entry.lastFailureAt = now;

  const wasOpen = entry.state === "open";
  if (entry.state === "half_open" || entry.failures >= FAILURE_THRESHOLD) {
    entry.state = "open";
    entry.openedAt = now;
    entry.failures = 0;
  }
  if (!wasOpen && entry.state === "open") {
    void import("@/lib/ai/alerts").then(({ slackNotifyAiBreakerOpen }) => {
      slackNotifyAiBreakerOpen({ modelId, environment });
    });
  }
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
