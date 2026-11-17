/**
 * Server caps each GET /api/provider/bookings at 1000 rows (limit). High-volume
 * providers need sequential offset pages merged client-side.
 */
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import type { ApiError } from "@beautonomi/types";

/**
 * Must not exceed the server cap in `apps/web/src/app/api/provider/bookings/route.ts`
 * (Math.min(limit, 1000)). Each row embeds ~10 relations; 1000-row pages over a
 * 60-day window hit the database statement timeout (500 after ~40s) on busy salons.
 */
export const PROVIDER_BOOKINGS_PAGE_SIZE = 250;

export function bookingsPathWithPagination(path: string, pageSize: number, offset: number): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const u = new URL(normalized, "https://provider.app");
  u.searchParams.delete("limit");
  u.searchParams.delete("offset");
  u.searchParams.set("limit", String(pageSize));
  u.searchParams.set("offset", String(offset));
  return `${u.pathname}${u.search}`;
}

function throwBookingsFetchError(e: ApiError): never {
  const err = new Error(getApiErrorMessage(e, "Failed to load bookings")) as Error & {
    code?: string;
  };
  err.code = e.code;
  throw err;
}

/**
 * Screens mount several hooks over the same range (e.g. strip + overview), and each
 * page can take tens of seconds on large accounts. Identical concurrent requests
 * share one network call instead of piling duplicate load on the API.
 */
const inflightPages = new Map<string, Promise<unknown[]>>();

/**
 * Fetch a single page of bookings for the given filter path.
 */
export async function fetchProviderBookingsPage<T = Record<string, unknown>>(
  path: string,
  offset: number,
  options?: { pageSize?: number; timeoutMs?: number },
): Promise<T[]> {
  const pageSize = options?.pageSize ?? PROVIDER_BOOKINGS_PAGE_SIZE;
  const timeoutMs = options?.timeoutMs;
  const p = bookingsPathWithPagination(path, pageSize, offset);
  const existing = inflightPages.get(p);
  if (existing) return (await existing) as T[];
  const request = (async () => {
    const res = await api.get<T[]>(
      p,
      timeoutMs && timeoutMs > 0 ? { timeout: timeoutMs } : undefined,
    );
    if (res.error) throwBookingsFetchError(res.error);
    return (Array.isArray(res.data) ? res.data : []) as T[];
  })();
  inflightPages.set(p, request);
  try {
    return await request;
  } finally {
    if (inflightPages.get(p) === request) inflightPages.delete(p);
  }
}

/**
 * Fetches all booking rows for the same filter/sort as `path` by following
 * server-side offset pages until a page returns fewer than `pageSize` rows.
 */
export async function fetchAllProviderBookingsPages<T = Record<string, unknown>>(
  path: string,
  options?: { pageSize?: number; timeoutMs?: number },
): Promise<T[]> {
  const pageSize = options?.pageSize ?? PROVIDER_BOOKINGS_PAGE_SIZE;
  const timeoutMs = options?.timeoutMs;
  const out: T[] = [];
  let offset = 0;

  for (let n = 0; n < 10_000; n += 1) {
    const rows = await fetchProviderBookingsPage<T>(path, offset, { pageSize, timeoutMs });
    out.push(...rows);
    if (rows.length < pageSize) break;
    offset += pageSize;
  }

  return out;
}
