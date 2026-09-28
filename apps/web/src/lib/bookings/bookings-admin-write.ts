import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client for `bookings` writes after route-level auth.
 * Replaces reliance on customer/provider UPDATE RLS policies.
 */
export function getBookingsAdminClient(): SupabaseClient {
  return getSupabaseAdmin();
}
