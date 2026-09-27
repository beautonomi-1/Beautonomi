import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_PAYROLL_TIMEZONE } from "./period-bounds";

/** Resolve IANA timezone for payroll date boundaries (provider → tenant → default). */
export async function getProviderPayrollTimezone(
  supabase: SupabaseClient,
  providerId: string,
): Promise<string> {
  const { data: provider } = await supabase
    .from("providers")
    .select("timezone, tenant_id")
    .eq("id", providerId)
    .maybeSingle();

  const providerTz = (provider as { timezone?: string | null } | null)?.timezone?.trim();
  if (providerTz) return providerTz;

  const tenantId = (provider as { tenant_id?: string | null } | null)?.tenant_id;
  if (tenantId) {
    const { data: tenant } = await supabase
      .from("tenants")
      .select("default_timezone")
      .eq("id", tenantId)
      .maybeSingle();
    const tenantTz = (tenant as { default_timezone?: string | null } | null)?.default_timezone?.trim();
    if (tenantTz) return tenantTz;
  }

  return DEFAULT_PAYROLL_TIMEZONE;
}
