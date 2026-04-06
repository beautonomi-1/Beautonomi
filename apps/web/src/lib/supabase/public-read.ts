import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * Anonymous Supabase client — no `cookies()` / request context.
 * Use for public RLS-backed reads (e.g. `page_content`, `about_us_content`) so App Router
 * pages can be statically generated or ISR without dynamic server usage.
 */
export function createSupabaseAnonPublicClient(): SupabaseClient<Database> | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (
    !supabaseUrl ||
    !supabaseAnonKey ||
    supabaseUrl.includes("placeholder") ||
    supabaseUrl === "http://localhost:54321" ||
    supabaseAnonKey.includes("placeholder")
  ) {
    return null;
  }

  return createClient<Database>(supabaseUrl, supabaseAnonKey);
}
