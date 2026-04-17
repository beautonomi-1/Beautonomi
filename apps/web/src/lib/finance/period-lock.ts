/**
 * Financial Period Lock guard
 *
 * Prevents finance_transactions writes (payouts, manual ledger entries, refunds)
 * that would back-date into a locked accounting period.
 *
 * Locked periods are stored in the `financial_period_locks` table:
 *   id, tenant_id, period_start, period_end, locked_at, locked_by, notes
 *
 * If no table exists yet the guard always returns {locked: false} — safe fallback.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export interface PeriodLockCheckResult {
  locked: boolean;
  lockId?: string;
  periodStart?: string;
  periodEnd?: string;
  lockedAt?: string;
  notes?: string;
}

/**
 * Check whether a given date falls inside any locked period for the tenant.
 *
 * @param supabase   Service-role client (must bypass RLS).
 * @param tenantId   Tenant to check.
 * @param dateToCheck ISO date/timestamp of the transaction being written.
 */
export async function checkPeriodLock(
  supabase: SupabaseClient,
  tenantId: string | null | undefined,
  dateToCheck: string | Date
): Promise<PeriodLockCheckResult> {
  if (!tenantId) return { locked: false };

  const dateStr =
    typeof dateToCheck === "string" ? dateToCheck : dateToCheck.toISOString();

  try {
    const { data, error } = await (supabase.from("financial_period_locks") as any)
      .select("id, period_start, period_end, locked_at, notes")
      .eq("tenant_id", tenantId)
      .lte("period_start", dateStr)
      .gte("period_end", dateStr)
      .limit(1)
      .maybeSingle();

    if (error) {
      // If the table doesn't exist yet, treat as unlocked (safe default)
      if (
        error.code === "42P01" ||
        String(error.message).includes("does not exist")
      ) {
        return { locked: false };
      }
      console.warn("[period-lock] check error:", error.message);
      return { locked: false };
    }

    if (!data) return { locked: false };

    return {
      locked: true,
      lockId: data.id,
      periodStart: data.period_start,
      periodEnd: data.period_end,
      lockedAt: data.locked_at,
      notes: data.notes,
    };
  } catch {
    return { locked: false };
  }
}

/**
 * Returns a 409 response if the date falls within a locked period.
 * Use inside API route handlers before any finance_transactions insert.
 *
 * @example
 *   const guard = await enforcePeriodLock(supabase, tenantId, booking.created_at);
 *   if (guard) return guard;
 */
export async function enforcePeriodLock(
  supabase: SupabaseClient,
  tenantId: string | null | undefined,
  dateToCheck: string | Date
): Promise<NextResponse | null> {
  const result = await checkPeriodLock(supabase, tenantId, dateToCheck);
  if (!result.locked) return null;

  const period =
    result.periodStart && result.periodEnd
      ? `${result.periodStart.slice(0, 10)} – ${result.periodEnd.slice(0, 10)}`
      : "this period";

  return NextResponse.json(
    {
      data: null,
      error: {
        message: `This transaction falls within a locked accounting period (${period}). Unlock the period before making changes.`,
        code: "PERIOD_LOCKED",
        details: {
          lock_id: result.lockId,
          period_start: result.periodStart,
          period_end: result.periodEnd,
          locked_at: result.lockedAt,
          notes: result.notes,
        },
      },
    },
    { status: 409 }
  );
}
