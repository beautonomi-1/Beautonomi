import { Redis } from "@upstash/redis";

/**
 * Cache for Mapbox Directions results (distance/duration) keyed by rounded
 * coordinates (4 dp ≈ 11 m) + routing profile. 24h TTL.
 *
 * Upstash Redis when UPSTASH_REDIS_REST_URL/TOKEN are configured (shared across
 * serverless instances), otherwise a per-instance in-memory LRU.
 */

export const DIRECTIONS_CACHE_TTL_SECONDS = 24 * 60 * 60;
export const DIRECTIONS_CACHE_COORD_DECIMALS = 4;
const MAX_MEMORY_ENTRIES = 5000;

export type CachedDirections = {
  /** metres */
  distance: number;
  /** seconds */
  duration: number;
};

export type DirectionsCacheStore = {
  get(key: string): Promise<CachedDirections | null>;
  set(key: string, value: CachedDirections, ttlSeconds: number): Promise<void>;
};

export function roundCoord(value: number, decimals: number = DIRECTIONS_CACHE_COORD_DECIMALS): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "nan";
  // toFixed keeps "-0.0000" stable and avoids float noise in the key
  const fixed = n.toFixed(decimals);
  return fixed === `-${(0).toFixed(decimals)}` ? (0).toFixed(decimals) : fixed;
}

export function directionsCacheKey(params: {
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  profile: string;
}): string {
  const d = DIRECTIONS_CACHE_COORD_DECIMALS;
  return [
    "directions:v1",
    params.profile,
    `${roundCoord(params.fromLat, d)},${roundCoord(params.fromLng, d)}`,
    `${roundCoord(params.toLat, d)},${roundCoord(params.toLng, d)}`,
  ].join(":");
}

function isCachedDirections(value: unknown): value is CachedDirections {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return Number.isFinite(Number(v.distance)) && Number.isFinite(Number(v.duration));
}

// ── in-memory LRU ────────────────────────────────────────────────────────────

type MemoryEntry = { expiresAt: number; value: CachedDirections };
const memory = new Map<string, MemoryEntry>();

function memoryStore(): DirectionsCacheStore {
  return {
    async get(key) {
      const entry = memory.get(key);
      if (!entry) return null;
      if (entry.expiresAt <= Date.now()) {
        memory.delete(key);
        return null;
      }
      // LRU touch: re-insert so Map iteration order reflects recency
      memory.delete(key);
      memory.set(key, entry);
      return entry.value;
    },
    async set(key, value, ttlSeconds) {
      memory.delete(key);
      memory.set(key, { expiresAt: Date.now() + ttlSeconds * 1000, value });
      while (memory.size > MAX_MEMORY_ENTRIES) {
        const oldest = memory.keys().next().value;
        if (oldest === undefined) break;
        memory.delete(oldest);
      }
    },
  };
}

// ── Upstash ──────────────────────────────────────────────────────────────────

let redisClient: Redis | null | undefined;

function getRedis(): Redis | null {
  if (redisClient !== undefined) return redisClient;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  redisClient = url && token ? new Redis({ url, token }) : null;
  return redisClient;
}

function upstashStore(redis: Redis): DirectionsCacheStore {
  return {
    async get(key) {
      try {
        const raw = await redis.get<unknown>(key);
        if (raw == null) return null;
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        return isCachedDirections(parsed)
          ? { distance: Number(parsed.distance), duration: Number(parsed.duration) }
          : null;
      } catch {
        return null;
      }
    },
    async set(key, value, ttlSeconds) {
      try {
        await redis.set(key, JSON.stringify(value), { ex: ttlSeconds });
      } catch {
        // non-fatal
      }
    },
  };
}

export function resolveDirectionsCacheStore(): DirectionsCacheStore {
  const redis = getRedis();
  return redis ? upstashStore(redis) : memoryStore();
}

/** Test hook. */
export function __resetDirectionsCacheForTests(): void {
  memory.clear();
  redisClient = undefined;
}

/**
 * Return cached directions for the rounded (from, to, profile) tuple, or compute via
 * `loader` and cache for 24h. Loader failures are NOT cached (they propagate).
 */
export async function getCachedDirections(
  params: { fromLat: number; fromLng: number; toLat: number; toLng: number; profile: string },
  loader: () => Promise<CachedDirections>,
  options?: { store?: DirectionsCacheStore; ttlSeconds?: number },
): Promise<CachedDirections & { cached: boolean }> {
  const store = options?.store ?? resolveDirectionsCacheStore();
  const ttl = options?.ttlSeconds ?? DIRECTIONS_CACHE_TTL_SECONDS;
  const key = directionsCacheKey(params);

  const hit = await store.get(key);
  if (hit) return { ...hit, cached: true };

  const fresh = await loader();
  const value: CachedDirections = { distance: Number(fresh.distance), duration: Number(fresh.duration) };
  if (Number.isFinite(value.distance) && Number.isFinite(value.duration)) {
    await store.set(key, value, ttl);
  }
  return { ...value, cached: false };
}
