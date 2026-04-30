import type { SupabaseClient } from "@supabase/supabase-js";

type CountableSupabase = Pick<SupabaseClient, "from">;

async function hasRows(
  supabase: CountableSupabase,
  table: string,
  filters: Record<string, string>,
): Promise<boolean> {
  let query = supabase.from(table).select("id", { count: "exact", head: true });
  for (const [column, value] of Object.entries(filters)) {
    query = query.eq(column, value);
  }
  const { count, error } = await query;
  if (error) {
    // Some commerce tables are not guaranteed in older environments. Fail
    // closed for the table, but do not block other relationship checks.
    console.warn(`[provider-client-access] ${table} relationship check failed`, error);
    return false;
  }
  return Number(count ?? 0) > 0;
}

export async function hasProviderCustomerRelationship(
  supabase: CountableSupabase,
  providerId: string,
  customerId: string,
): Promise<boolean> {
  const checks = await Promise.all([
    hasRows(supabase, "provider_clients", { provider_id: providerId, customer_id: customerId }),
    hasProviderCustomerActivityRelationship(supabase, providerId, customerId),
  ]);

  return checks.some(Boolean);
}

export async function hasProviderCustomerActivityRelationship(
  supabase: CountableSupabase,
  providerId: string,
  customerId: string,
): Promise<boolean> {
  const checks = await Promise.all([
    hasRows(supabase, "bookings", { provider_id: providerId, customer_id: customerId }),
    hasRows(supabase, "conversations", { provider_id: providerId, customer_id: customerId }),
    hasRows(supabase, "sales", { provider_id: providerId, customer_id: customerId }),
    hasRows(supabase, "product_orders", { provider_id: providerId, customer_id: customerId }),
  ]);

  return checks.some(Boolean);
}
