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
let missingEnvReported = false;

/**
 * Resolves the public Supabase config. Returns null when either variable is
 * missing instead of silently falling back to a placeholder project (audit F-02):
 * in production a misconfigured build throws so it is caught at deploy time;
 * elsewhere it logs once and callers receive `null`, which they already handle.
 */
export function resolvePublicSupabaseConfig(
  env?: { NEXT_PUBLIC_SUPABASE_URL?: string; NEXT_PUBLIC_SUPABASE_ANON_KEY?: string },
  nodeEnv: string | undefined = process.env.NODE_ENV,
): { url: string; anonKey: string } | null {
  const source = env ?? {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
  const url = source.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const anonKey = source.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
  if (url && anonKey) return { url, anonKey };
  const missing = [
    !url ? "NEXT_PUBLIC_SUPABASE_URL" : null,
    !anonKey ? "NEXT_PUBLIC_SUPABASE_ANON_KEY" : null,
  ].filter(Boolean);
  const message = `Supabase browser client is not configured: missing ${missing.join(", ")}`;
  if (nodeEnv === "production") {
    throw new Error(message);
  }
  if (!missingEnvReported) {
    missingEnvReported = true;
    console.error(message);
  }
  return null;
}

export function getSupabaseClient(): ReturnType<typeof createBrowserClient<Database>> | null {
  if (typeof window === "undefined") return null;
  if (!clientInstance) {
    const config = resolvePublicSupabaseConfig();
    if (!config) return null;
    clientInstance = createBrowserClient<Database>(config.url, config.anonKey);
  }
  return clientInstance;
}
