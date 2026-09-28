import type { SupabaseClient } from "@supabase/supabase-js";

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
