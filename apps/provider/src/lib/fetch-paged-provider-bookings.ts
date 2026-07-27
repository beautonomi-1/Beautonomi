/**
 * Server caps each GET /api/provider/bookings at 1000 rows (limit). High-volume
 * providers need sequential offset pages merged client-side.
 */
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import type { ApiError } from "@beautonomi/types";

/** Must stay aligned with `apps/web/src/app/api/provider/bookings/route.ts` (Math.min(limit, 1000)). */
export const PROVIDER_BOOKINGS_PAGE_SIZE = 1000;

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
  const res = await api.get<T[]>(p, timeoutMs && timeoutMs > 0 ? { timeout: timeoutMs } : undefined);
  if (res.error) throwBookingsFetchError(res.error);
  return (Array.isArray(res.data) ? res.data : []) as T[];
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
