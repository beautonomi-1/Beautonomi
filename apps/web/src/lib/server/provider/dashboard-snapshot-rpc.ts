import type { SupabaseClient } from "@supabase/supabase-js";
import { Redis } from "@upstash/redis";

/**
 * `provider_dashboard_snapshot(p_provider_id, p_location_id, p_tz)` wrapper
 * (supabase/migrations/877_retention_and_dashboard_snapshot.sql) + a 30s cache
 * keyed by provider+location (Upstash when configured, in-memory otherwise).
 *
 * Enabled in get-provider-dashboard.ts with `DASHBOARD_SNAPSHOT_RPC=1`; the Node
 * row-aggregation path stays the default.
 */

export const DASHBOARD_SNAPSHOT_RPC_ENV = "DASHBOARD_SNAPSHOT_RPC";
export const DASHBOARD_SNAPSHOT_CACHE_TTL_SECONDS = 30;
const MAX_MEMORY_CACHE_ENTRIES = 1000;

export function isDashboardSnapshotRpcEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[DASHBOARD_SNAPSHOT_RPC_ENV] === "1";
}

export type DashboardSnapshotBookingCounts = {
  total_bookings: number;
  active_bookings: number;
  confirmed_bookings: number;
  pending_bookings: number;
  completed_bookings: number;
  cancelled_bookings: number;
  no_show_bookings: number;
  at_home_bookings: number;
  at_salon_bookings: number;
  at_home_completed: number;
  at_salon_completed: number;
  at_home_confirmed: number;
  at_salon_confirmed: number;
  at_home_pending: number;
  at_salon_pending: number;
  at_home_cancelled: number;
  at_salon_cancelled: number;
  at_home_no_show: number;
  at_salon_no_show: number;
};

export type DashboardSnapshotPeriodNumbers = {
  today: number;
  this_week: number;
  this_month: number;
  yesterday: number;
  prior_week: number;
  prior_month: number;
};

export type DashboardSnapshotRevenue = DashboardSnapshotPeriodNumbers & {
  last_month: number;
};

export type DashboardSnapshot = {
  version: number;
  generated_at: string | null;
  tz: string;
  bookings: DashboardSnapshotBookingCounts;
  schedule: DashboardSnapshotPeriodNumbers;
  revenue: DashboardSnapshotRevenue;
};

const BOOKING_COUNT_KEYS: ReadonlyArray<keyof DashboardSnapshotBookingCounts> = [
  "total_bookings",
  "active_bookings",
  "confirmed_bookings",
  "pending_bookings",
  "completed_bookings",
  "cancelled_bookings",
  "no_show_bookings",
  "at_home_bookings",
  "at_salon_bookings",
  "at_home_completed",
  "at_salon_completed",
  "at_home_confirmed",
  "at_salon_confirmed",
  "at_home_pending",
  "at_salon_pending",
  "at_home_cancelled",
  "at_salon_cancelled",
  "at_home_no_show",
  "at_salon_no_show",
];

const PERIOD_KEYS: ReadonlyArray<keyof DashboardSnapshotPeriodNumbers> = [
  "today",
  "this_week",
  "this_month",
  "yesterday",
  "prior_week",
  "prior_month",
];

function toNumber(value: unknown): number {
  if (value == null) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Map the raw jsonb payload from the RPC into a fully-populated, numeric snapshot.
 * Postgres may emit numerics as strings (bigint/numeric via PostgREST) — everything is
 * coerced with `Number` and missing keys default to 0. Returns null for non-object input.
 */
export function parseDashboardSnapshot(raw: unknown): DashboardSnapshot | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const root = raw as Record<string, unknown>;
  const rawBookings = asRecord(root.bookings);
  const rawSchedule = asRecord(root.schedule);
  const rawRevenue = asRecord(root.revenue);

  const bookings = {} as DashboardSnapshotBookingCounts;
  for (const key of BOOKING_COUNT_KEYS) bookings[key] = toNumber(rawBookings[key]);

  const schedule = {} as DashboardSnapshotPeriodNumbers;
  for (const key of PERIOD_KEYS) schedule[key] = toNumber(rawSchedule[key]);

  const revenue = { last_month: toNumber(rawRevenue.last_month) } as DashboardSnapshotRevenue;
  for (const key of PERIOD_KEYS) revenue[key] = toNumber(rawRevenue[key]);

  return {
    version: toNumber(root.version) || 1,
    generated_at: typeof root.generated_at === "string" ? root.generated_at : null,
    tz: typeof root.tz === "string" && root.tz ? root.tz : "UTC",
    bookings,
    schedule,
    revenue,
  };
}

export type DashboardSnapshotParams = {
  providerId: string;
  locationId?: string | null;
  timezone: string;
};

export type DashboardSnapshotResult =
  | { ok: true; snapshot: DashboardSnapshot; cached: boolean }
  | { ok: false; error: string };

export async function fetchProviderDashboardSnapshot(
  supabase: SupabaseClient,
  params: DashboardSnapshotParams,
): Promise<DashboardSnapshotResult> {
  const { data, error } = await supabase.rpc("provider_dashboard_snapshot" as never, {
    p_provider_id: params.providerId,
    p_location_id: params.locationId ?? null,
    p_tz: params.timezone,
  } as never);
  if (error) {
    return { ok: false, error: error.message || "provider_dashboard_snapshot failed" };
  }
  const snapshot = parseDashboardSnapshot(data);
  if (snapshot === null) {
    return { ok: false, error: "provider_dashboard_snapshot returned no payload" };
  }
  return { ok: true, snapshot, cached: false };
}

// ── 30s cache (Upstash → in-memory fallback) ─────────────────────────────────

export function dashboardSnapshotCacheKey(params: DashboardSnapshotParams): string {
  return `dashboard:snapshot:v1:${params.providerId}:${params.locationId || "all"}:${params.timezone}`;
}

type MemoryEntry = { expiresAt: number; snapshot: DashboardSnapshot };
const memoryCache = new Map<string, MemoryEntry>();

function pruneMemoryCache(now: number): void {
  for (const [key, entry] of memoryCache.entries()) {
    if (entry.expiresAt <= now) memoryCache.delete(key);
  }
  if (memoryCache.size <= MAX_MEMORY_CACHE_ENTRIES) return;
  const overflow = memoryCache.size - MAX_MEMORY_CACHE_ENTRIES;
  const keys = Array.from(memoryCache.keys());
  for (let i = 0; i < overflow; i += 1) memoryCache.delete(keys[i]);
}

let redisClient: Redis | null | undefined;

function getRedis(): Redis | null {
  if (redisClient !== undefined) return redisClient;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  redisClient = url && token ? new Redis({ url, token }) : null;
  return redisClient;
}

/** Test hook: reset caches/clients between cases. */
export function __resetDashboardSnapshotCacheForTests(): void {
  memoryCache.clear();
  redisClient = undefined;
}

export type DashboardSnapshotCacheStore = {
  get(key: string): Promise<DashboardSnapshot | null>;
  set(key: string, snapshot: DashboardSnapshot, ttlSeconds: number): Promise<void>;
};

function memoryStore(): DashboardSnapshotCacheStore {
  return {
    async get(key) {
      const entry = memoryCache.get(key);
      if (!entry) return null;
      if (entry.expiresAt <= Date.now()) {
        memoryCache.delete(key);
        return null;
      }
      return entry.snapshot;
    },
    async set(key, snapshot, ttlSeconds) {
      memoryCache.set(key, { expiresAt: Date.now() + ttlSeconds * 1000, snapshot });
      pruneMemoryCache(Date.now());
    },
  };
}

function upstashStore(redis: Redis): DashboardSnapshotCacheStore {
  return {
    async get(key) {
      try {
        const raw = await redis.get<unknown>(key);
        if (raw == null) return null;
        return parseDashboardSnapshot(typeof raw === "string" ? JSON.parse(raw) : raw);
      } catch {
        return null;
      }
    },
    async set(key, snapshot, ttlSeconds) {
      try {
        await redis.set(key, JSON.stringify(snapshot), { ex: ttlSeconds });
      } catch {
        // cache write failures are non-fatal
      }
    },
  };
}

export function resolveDashboardSnapshotCacheStore(): DashboardSnapshotCacheStore {
  const redis = getRedis();
  return redis ? upstashStore(redis) : memoryStore();
}

/**
 * Cached snapshot: Upstash (shared across instances) when
 * UPSTASH_REDIS_REST_URL/TOKEN are set, else per-instance memory. TTL 30s.
 */
export async function getProviderDashboardSnapshotCached(
  supabase: SupabaseClient,
  params: DashboardSnapshotParams,
  options?: { store?: DashboardSnapshotCacheStore; ttlSeconds?: number },
): Promise<DashboardSnapshotResult> {
  const store = options?.store ?? resolveDashboardSnapshotCacheStore();
  const ttl = options?.ttlSeconds ?? DASHBOARD_SNAPSHOT_CACHE_TTL_SECONDS;
  const key = dashboardSnapshotCacheKey(params);

  const hit = await store.get(key);
  if (hit) return { ok: true, snapshot: hit, cached: true };

  const result = await fetchProviderDashboardSnapshot(supabase, params);
  if (result.ok === false) return result;
  await store.set(key, result.snapshot, ttl);
  return result;
}
