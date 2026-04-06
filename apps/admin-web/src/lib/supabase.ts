import { createBrowserClient } from "@supabase/ssr";

let client: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseBrowserClient() {
  if (typeof window === "undefined") return null;
  if (!client) {
    const url = import.meta.env.VITE_SUPABASE_URL || "";
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
    if (!url || !key) {
      console.warn("admin-web: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set");
    }
    client = createBrowserClient(url || "https://placeholder.supabase.co", key || "placeholder");
  }
  return client;
}
