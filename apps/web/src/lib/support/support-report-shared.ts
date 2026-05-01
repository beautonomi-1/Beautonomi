/**
 * Shared helpers for admin support reports (`/api/admin/reports/support-*`).
 *
 * Keeps tenant scoping, period parsing, and SLA targets consistent across the
 * Support Performance and Support Workload & Drivers reports.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchAllProviderIdsForTenant } from "@/lib/tenant/admin-tenant-scope";
import { resolutionSlaHoursForPriority } from "@/lib/support/support-ticket-sla";

export type SupportReportPeriod = "7d" | "30d" | "90d" | "1y";

export interface SupportReportWindow {
  period: string;
  startDate: Date;
  endDate: Date;
  startISO: string;
  endISO: string;
}

/** Parse `period`, `start_date`, `end_date` into a concrete window (defaults to 30d). */
export function getPeriodWindow(
  period: string | null,
  startParam: string | null,
  endParam: string | null
): SupportReportWindow {
  const now = new Date();
  let startDate: Date;
  let endDate: Date = now;

  if (startParam && endParam) {
    startDate = new Date(startParam);
    endDate = new Date(endParam);
  } else {
    switch (period) {
      case "7d":
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "90d":
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case "1y":
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      case "30d":
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }
  }

  return {
    period: period || "30d",
    startDate,
    endDate,
    startISO: startDate.toISOString(),
    endISO: endDate.toISOString(),
  };
}

export interface SupportTicketScope {
  /** Customer/staff user IDs that belong to this tenant. */
  userIds: string[];
  /** Provider IDs in this tenant (used to scope provider-raised tickets). */
  providerIds: string[];
}

/**
 * Build the tenant-scoped user/provider id sets used to filter
 * `support_tickets` rows for a tenant. Mirrors the customer report
 * approach: match by `user_id` OR `provider_id`.
 */
export async function getTenantTicketScope(
  supabase: SupabaseClient,
  tenantId: string
): Promise<SupportTicketScope> {
  const admin = getSupabaseAdmin();
  const [{ data: idRows, error: uidErr }, providerIds] = await Promise.all([
    admin.rpc("admin_user_ids_in_tenant_scope", { p_tenant_id: tenantId }),
    fetchAllProviderIdsForTenant(supabase, tenantId),
  ]);
  if (uidErr) throw uidErr;
  const userIds = (idRows ?? []).map((r: { id: string }) => r.id);
  return { userIds, providerIds };
}

/** Median of a numeric array (returns null if empty). */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/** SLA resolution target for a priority, expressed in milliseconds. */
export function slaTargetMsForPriority(priority: string | null | undefined): number {
  return resolutionSlaHoursForPriority(priority) * 3600_000;
}

/** Convert ms → hours, rounded to one decimal (or null). */
export function msToHours(ms: number | null): number | null {
  if (ms == null) return null;
  return Math.round((ms / 3600_000) * 10) / 10;
}

/** Convert ms → minutes, rounded to one decimal (or null). */
export function msToMinutes(ms: number | null): number | null {
  if (ms == null) return null;
  return Math.round((ms / 60_000) * 10) / 10;
}

/** Calendar day key (YYYY-MM-DD) for an ISO timestamp. */
export function dayKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return new Date(iso).toISOString().slice(0, 10);
}

/** True when a ticket missed its resolution SLA (open + overdue, or resolved late). */
export function isSlaBreached(ticket: {
  status?: string | null;
  sla_resolution_due_at?: string | null;
  resolved_at?: string | null;
  closed_at?: string | null;
}): boolean {
  if (!ticket.sla_resolution_due_at) return false;
  const due = new Date(ticket.sla_resolution_due_at).getTime();
  const isClosedLike = ticket.status === "resolved" || ticket.status === "closed";
  if (isClosedLike) {
    const closedAt = ticket.resolved_at ?? ticket.closed_at;
    if (!closedAt) return false;
    return new Date(closedAt).getTime() > due;
  }
  return due < Date.now();
}

/** Inclusive day iterator yielding YYYY-MM-DD strings between two dates. */
export function* iterateDays(start: Date, end: Date): Generator<string> {
  const cur = new Date(start);
  cur.setUTCHours(0, 0, 0, 0);
  const last = new Date(end);
  last.setUTCHours(0, 0, 0, 0);
  while (cur.getTime() <= last.getTime()) {
    yield cur.toISOString().slice(0, 10);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
}
