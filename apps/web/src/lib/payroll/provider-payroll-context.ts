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

/**
 * Provider payroll country (ISO2) from the tenant's region_code.
 * `providers` has no country column; per-location jurisdiction still wins in staff meta.
 */
export async function getProviderPayrollCountry(
  supabase: SupabaseClient,
  providerId: string,
): Promise<string | null> {
  const { data: provider } = await supabase
    .from("providers")
    .select("tenant_id")
    .eq("id", providerId)
    .maybeSingle();
  const tenantId = (provider as { tenant_id?: string | null } | null)?.tenant_id;
  if (!tenantId) return null;

  const { data: tenant } = await supabase
    .from("tenants")
    .select("region_code")
    .eq("id", tenantId)
    .maybeSingle();
  const code = (tenant as { region_code?: string | null } | null)?.region_code?.trim().slice(0, 2).toUpperCase();
  return code && /^[A-Z]{2}$/.test(code) ? code : null;
}
