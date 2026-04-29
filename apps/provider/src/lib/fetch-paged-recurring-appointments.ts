/**
 * GET /api/provider/recurring-appointments is page+limit; merge all pages so
 * high-volume providers are not stuck at a single 500-row cap in the app.
 */
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import type { ApiError } from "@beautonomi/types";

export const RECURRING_APPOINTMENTS_PAGE_SIZE = 100;

type RecurringListPage = {
  data?: unknown[];
  total?: number;
  page?: number;
  total_pages?: number;
};

export async function fetchAllRecurringAppointmentPages<T>(
  locationId: string | null,
): Promise<
  { ok: true; rows: T[]; total: number } | { ok: false; message: string; code: string | null }
> {
  const buildPath = (page: number) => {
    const qs = new URLSearchParams({
      limit: String(RECURRING_APPOINTMENTS_PAGE_SIZE),
      page: String(page),
    });
    if (locationId) qs.set("location_id", locationId);
    return `/api/provider/recurring-appointments?${qs.toString()}`;
  };

  const first = await api.get<RecurringListPage>(buildPath(1));
  if (first.error) {
    const e = first.error as ApiError;
    return {
      ok: false,
      message: getApiErrorMessage(e, "Failed to load recurring appointments"),
      code: e.code ?? null,
    };
  }
  const body = first.data;
  if (!body) {
    return { ok: true, rows: [], total: 0 };
  }

  let combined = [...((body.data ?? []) as T[])];
  const total = body.total ?? combined.length;
  const totalPages = Math.max(1, body.total_pages ?? 1);

  if (totalPages > 1) {
    const rest = await Promise.all(
      Array.from({ length: totalPages - 1 }, (_, i) => api.get<RecurringListPage>(buildPath(i + 2))),
    );
    for (const r of rest) {
      if (r.error) {
        const e = r.error as ApiError;
        return {
          ok: false,
          message: getApiErrorMessage(e, "Failed to load recurring appointments"),
          code: e.code ?? null,
        };
      }
      combined = combined.concat((r.data?.data ?? []) as T[]);
    }
  }

  return { ok: true, rows: combined, total };
}
