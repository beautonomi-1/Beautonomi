import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolveStaffPermissionRow,
  type PermissionRequestContext,
} from "@/lib/auth/permissions";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getProviderIdForUser } from "@/lib/supabase/api-helpers";

export type PayrollAccessGate =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string };

export async function assertPayrollEnabledForProvider(
  supabase: SupabaseClient,
  providerId: string,
): Promise<PayrollAccessGate> {
  const { data } = await supabase
    .from("providers")
    .select("business_type")
    .eq("id", providerId)
    .maybeSingle();
  if ((data as { business_type?: string } | null)?.business_type === "freelancer") {
    return {
      ok: false as const,
      message: "Payroll is available after upgrading to a salon account.",
    };
  }
  return { ok: true as const };
}

/** Returns an error message when payroll is disabled for this provider (e.g. freelancer). */
export async function payrollDisabledMessage(
  supabase: SupabaseClient,
  providerId: string,
): Promise<string | null> {
  const gate = await assertPayrollEnabledForProvider(supabase, providerId);
  return gate.ok === false ? gate.message : null;
}

/**
 * Payroll for the active salon only.
 * Owning a different salon does not grant payroll on this one.
 * Superadmin is not included by role alone.
 */
export async function userCanManagePayroll(
  userId: string,
  request?: PermissionRequestContext | NextRequest,
): Promise<boolean> {
  const admin = getSupabaseAdmin();
  const providerId = await getProviderIdForUser(userId, admin, { request });
  if (!providerId) return false;

  const { data: provider } = await admin
    .from("providers")
    .select("user_id")
    .eq("id", providerId)
    .maybeSingle();
  if ((provider as { user_id?: string | null } | null)?.user_id === userId) return true;

  const { data: staff } = await admin
    .from("provider_staff")
    .select("role, permissions, role_id, is_admin, user_id, provider_id")
    .eq("user_id", userId)
    .eq("provider_id", providerId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();
  if (!staff) return false;

  const perms = await resolveStaffPermissionRow(
    admin,
    staff as {
      role: string;
      permissions?: unknown;
      role_id?: string | null;
      is_admin?: boolean;
      user_id?: string | null;
      provider_id?: string;
    },
    providerId,
  );
  return perms.manage_payroll === true;
}
