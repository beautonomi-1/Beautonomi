import { fetcher } from "@/lib/http/fetcher";
import type { HomePageInitialData } from "@/app/home/home-initial-types";
import { PUBLIC_HOME_CLIENT_TIMEOUT_MS } from "@/app/home/home-public-api";

type HomeApiResponse = { data?: HomePageInitialData };

const inflight = new Map<string, Promise<HomeApiResponse>>();
/** Short TTL so revisiting a category is instant without stale data for long. */
const CACHE_TTL_MS = 15_000;
const responseCache = new Map<string, { at: number; data: HomeApiResponse }>();
const MAX_CACHE_ENTRIES = 48;

function rememberCache(key: string, data: HomeApiResponse) {
  if (!data?.data) return;
  if (responseCache.size >= MAX_CACHE_ENTRIES) {
    const first = responseCache.keys().next().value as string | undefined;
    if (first) responseCache.delete(first);
  }
  responseCache.set(key, { at: Date.now(), data });
}

/**
 * Deduplicates concurrent GET /api/public/home calls with identical query strings
 * (e.g. five home sections firing together after a category change → one network request).
 * Also memoizes successful responses briefly so category toggles feel instant when repeated.
 */
export function fetchPublicHomeClient(params: URLSearchParams): Promise<HomeApiResponse> {
  const key = params.toString();
  const hit = responseCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return Promise.resolve(hit.data);
  }

  const existing = inflight.get(key);
  if (existing) return existing;

  const query = key ? `?${key}` : "";
  const p = fetcher
    .get<HomeApiResponse>(`/api/public/home${query}`, {
      timeoutMs: PUBLIC_HOME_CLIENT_TIMEOUT_MS,
    })
    .then((res) => {
      rememberCache(key, res);
      return res;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, p);
  return p;
}
