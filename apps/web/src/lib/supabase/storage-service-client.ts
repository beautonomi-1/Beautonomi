/**
 * Server-side Storage uploads should use the service role when available so
 * `listBuckets` / `createBucket` / uploads are not blocked by empty bucket lists
 * from the anon + session client (a common false "bucket not found" scenario).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function hasSupabaseStorageServiceRole(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() && process.env.NEXT_PUBLIC_SUPABASE_URL?.trim());
}

/** Prefer service role for Storage; fall back to the user-scoped server client. */
export function getStorageServiceClientOrUser(userSupabase: SupabaseClient): SupabaseClient {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (serviceRoleKey && supabaseUrl) {
    return createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return userSupabase;
}
