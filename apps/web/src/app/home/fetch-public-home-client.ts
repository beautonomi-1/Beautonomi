import { fetcher } from "@/lib/http/fetcher";
import type { HomePageInitialData } from "@/app/home/home-initial-types";
import { PUBLIC_HOME_CLIENT_TIMEOUT_MS } from "@/app/home/home-public-api";

type HomeApiResponse = { data?: HomePageInitialData };

const inflight = new Map<string, Promise<HomeApiResponse>>();

/**
 * Deduplicates concurrent GET /api/public/home calls with identical query strings
 * (e.g. five home sections firing together after a category change → one network request).
 */
export function fetchPublicHomeClient(params: URLSearchParams): Promise<HomeApiResponse> {
  const key = params.toString();
  const existing = inflight.get(key);
  if (existing) return existing;

  const query = key ? `?${key}` : "";
  const p = fetcher
    .get<HomeApiResponse>(`/api/public/home${query}`, {
      timeoutMs: PUBLIC_HOME_CLIENT_TIMEOUT_MS,
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, p);
  return p;
}
