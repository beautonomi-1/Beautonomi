import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type SupabaseAdminClient = SupabaseClient<Database>;

/**
 * Durable step wrapper for Supabase side effects.
 * Call only from `"use step"` functions — never from workflow orchestrators.
 */
export async function supabaseStep<T>(
  label: string,
  fn: (client: SupabaseAdminClient) => Promise<T>,
): Promise<T> {
  const client = getSupabaseAdmin();
  try {
    return await fn(client);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`supabaseStep(${label}): ${message}`, { cause: error });
  }
}
