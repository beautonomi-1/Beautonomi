import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/config/publicEnv";

let client: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseBrowserClient() {
  if (typeof window === "undefined") return null;
  if (!client) {
    const url = publicEnv.supabaseUrl || "";
    const key = publicEnv.supabaseAnonKey || "";
    if (!url || !key) {
      console.warn(
        "admin-web: set VITE_SUPABASE_* or NEXT_PUBLIC_SUPABASE_* (see apps/admin-web/.env.example)"
      );
    }
    client = createBrowserClient(url || "https://placeholder.supabase.co", key || "placeholder");
  }
  return client;
}
