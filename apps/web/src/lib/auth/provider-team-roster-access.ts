import type { SupabaseClient } from "@supabase/supabase-js";
import type { PermissionRequestContext } from "@/lib/auth/permissions";
import { hasPermission, isProviderOwner } from "@/lib/auth/permissions";

/** Full: owner or explicit team visibility. Redacted: calendar/scheduling can still see roster but not colleague PII. */
export type TeamRosterDetailLevel = "full" | "redacted";

/**
 * Who can see emails/phones for all team members. Others get roster with PII stripped (except own row).
 * Pass `request` from API routes so mobile Bearer tokens resolve permissions correctly.
 */
export async function getTeamRosterDetailLevel(
  userId: string,
  request?: PermissionRequestContext,
): Promise<TeamRosterDetailLevel> {
  if (await isProviderOwner(userId, request)) return "full";
  const [viewTeam, manageTeam] = await Promise.all([
    hasPermission(userId, "view_team", undefined, request),
    hasPermission(userId, "manage_team", undefined, request),
  ]);
  if (viewTeam || manageTeam) return "full";
  return "redacted";
}

export async function getProviderStaffIdForUser(
  userId: string,
  providerId: string,
  supabase: SupabaseClient,
): Promise<string | null> {
  const { data } = await supabase
    .from("provider_staff")
    .select("id")
    .eq("user_id", userId)
    .eq("provider_id", providerId)
    .maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

/** Salary, commission, and the time-clock PIN. Contact roster access does not include these. */
export async function canViewStaffPay(
  userId: string,
  request?: PermissionRequestContext,
): Promise<boolean> {
  if (await isProviderOwner(userId, request)) return true;
  const [payroll, team] = await Promise.all([
    hasPermission(userId, "manage_payroll", undefined, request),
    hasPermission(userId, "manage_team", undefined, request),
  ]);
  return payroll || team;
}

const HIDDEN_PAY_FIELDS: Record<string, null | false | ""> = {
  salary: null,
  hourly_rate: null,
  commission_rate: null,
  service_commission_rate: null,
  product_commission_rate: null,
  commission_enabled: false,
  time_clock_pin: "",
};

export function redactStaffPayFields<T extends object>(row: T, visible: boolean): T {
  if (visible) return row;
  const next = { ...row } as Record<string, unknown>;
  for (const [key, hidden] of Object.entries(HIDDEN_PAY_FIELDS)) {
    if (key in row) next[key] = hidden;
  }
  return next as T;
}

export function redactStaffRowForViewer<T extends { user_id?: string | null; email?: string | null; phone?: string | null }>(
  row: T,
  viewerUserId: string,
  level: TeamRosterDetailLevel,
): T {
  if (level === "full") return row;
  if (row.user_id === viewerUserId) return row;
  return { ...row, email: "", phone: null };
}
