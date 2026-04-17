/**
 * Anonymous Supabase client for public, RLS-allowed reads without cookies/session.
 * Use for ISR/static-friendly server components and loaders — never imports `next/headers`.
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

let cached: ReturnType<typeof createClient<Database>> | null = null;

export function getSupabasePublicAnon(): ReturnType<typeof createClient<Database>> {
  if (cached) return cached;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || supabaseUrl.includes("placeholder") || supabaseUrl === "http://localhost:54321") {
    throw new Error(
      "FATAL: NEXT_PUBLIC_SUPABASE_URL is not configured. " +
        "Set it in your .env.local file. Get your URL from: https://supabase.com/dashboard/project/_/settings/api",
    );
  }

  if (!supabaseAnonKey || supabaseAnonKey.includes("placeholder")) {
    throw new Error(
      "FATAL: NEXT_PUBLIC_SUPABASE_ANON_KEY is not configured. " +
        "Set it in your .env.local file. Get your key from: https://supabase.com/dashboard/project/_/settings/api",
    );
  }

  cached = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return cached;
}
