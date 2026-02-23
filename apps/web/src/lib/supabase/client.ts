/**
 * Supabase Browser Client
 *
 * Use this for client-side operations in authenticated pages.
 * For server-side operations, use the server client.
 *
 * This file is only loaded on the client (ClientAppShell is dynamic with ssr: false),
 * so it is safe to use createBrowserClient here.
 */

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

let clientInstance: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function getSupabaseClient(): ReturnType<typeof createBrowserClient<Database>> | null {
  if (typeof window === "undefined") return null;
  if (!clientInstance) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE2NDUxOTIwMDAsImV4cCI6MTk2MDc2ODAwMH0.placeholder";
    clientInstance =
      supabaseUrl && supabaseAnonKey && supabaseUrl !== "" && supabaseAnonKey !== ""
        ? createBrowserClient<Database>(supabaseUrl, supabaseAnonKey)
        : createBrowserClient<Database>("https://placeholder.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE2NDUxOTIwMDAsImV4cCI6MTk2MDc2ODAwMH0.placeholder");
  }
  return clientInstance;
}
