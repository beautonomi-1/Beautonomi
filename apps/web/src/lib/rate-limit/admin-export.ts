/**
 * Distributed rate limiter for admin export endpoints.
 *
 * Replaces the legacy in-memory `lib/rate-limit.ts` with the Upstash-backed
 * `store.ts` implementation so limits are shared across all serverless
 * instances when UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are set.
 * Falls back to in-memory per-instance when env vars are absent (dev).
 *
 * Usage:
 *   import { checkAdminExportRateLimit } from "@/lib/rate-limit/admin-export";
 *   const { allowed, retryAfter } = await checkAdminExportRateLimit(userId, "export:users");
 */
import { checkRateLimit } from "./store";

const ADMIN_EXPORT_CONFIG = {
  prefix: "admin:export",
  limit: 30,
  windowSeconds: 3600, // 1 hour
} as const;

export async function checkAdminExportRateLimit(
  userId: string,
  endpoint: string,
): Promise<{ allowed: boolean; remaining: number; retryAfter?: number }> {
  const key = `${userId}:${endpoint}`;
  const result = await checkRateLimit(ADMIN_EXPORT_CONFIG, key);
  return {
    allowed: result.allowed,
    remaining: result.remaining,
    retryAfter: result.retryAfterSeconds,
  };
}
