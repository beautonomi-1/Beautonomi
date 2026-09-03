import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

let redis: Redis | null = null;
let warnedMissingUpstash = false;

function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  redis = new Redis({ url, token });
  return redis;
}

export type RateLimitConfig = {
  prefix: string;
  limit: number;
  windowSeconds: number;
};

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds?: number;
}

const inMemoryStores = new Map<string, Map<string, { count: number; firstAt: number }>>();

function getInMemoryStore(prefix: string) {
  let store = inMemoryStores.get(prefix);
  if (!store) {
    store = new Map();
    inMemoryStores.set(prefix, store);
  }
  return store;
}

function pruneInMemory(store: Map<string, { count: number; firstAt: number }>, windowMs: number) {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now - entry.firstAt > windowMs) store.delete(key);
  }
}

function checkInMemory(
  config: RateLimitConfig,
  key: string,
): RateLimitResult {
  const windowMs = config.windowSeconds * 1000;
  const store = getInMemoryStore(config.prefix);
  pruneInMemory(store, windowMs);

  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now - entry.firstAt > windowMs) {
    store.set(key, { count: 1, firstAt: now });
    return { allowed: true, remaining: config.limit - 1 };
  }

  entry.count += 1;

  if (entry.count > config.limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil((entry.firstAt + windowMs - now) / 1000),
    };
  }

  return { allowed: true, remaining: config.limit - entry.count };
}

function warnMissingUpstashInProduction(config: RateLimitConfig): void {
  if (warnedMissingUpstash) return;
  if (process.env.VERCEL_ENV !== "production") return;
  if (getRedis()) return;
  warnedMissingUpstash = true;
  try {
    console.error(
      JSON.stringify({
        metric: "rate_limit_upstash_missing",
        severity: "critical",
        ts: new Date().toISOString(),
        message:
          "UPSTASH_REDIS_REST_URL/TOKEN not configured in production; rate limits fall back to per-instance memory.",
      }),
    );
  } catch {
    // ignore
  }
}

function shouldFailClosedWithoutUpstash(config: RateLimitConfig): boolean {
  if (process.env.VERCEL_ENV !== "production" || getRedis()) return false;
  if (config.prefix === "sign-in" || config.prefix === "payment-init") return true;
  if (config.prefix.startsWith("otp-verify")) return true;
  return config.prefix.startsWith("payout-request");
}

export async function checkRateLimit(
  config: RateLimitConfig,
  key: string,
): Promise<RateLimitResult> {
  const client = getRedis();

  if (!client) {
    warnMissingUpstashInProduction(config);
    if (shouldFailClosedWithoutUpstash(config)) {
      return { allowed: false, remaining: 0, retryAfterSeconds: 60 };
    }
    return checkInMemory(config, key);
  }

  const limiter = new Ratelimit({
    redis: client,
    prefix: `rl:${config.prefix}`,
    limiter: Ratelimit.slidingWindow(config.limit, `${config.windowSeconds} s`),
  });

  const result = await limiter.limit(key);

  return {
    allowed: result.success,
    remaining: result.remaining,
    retryAfterSeconds: result.success
      ? undefined
      : Math.ceil((result.reset - Date.now()) / 1000),
  };
}

export function getClientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}
