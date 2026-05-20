import "react-native-url-polyfill/auto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/config/public-env";
import { authStorage } from "./auth-storage";

const noopUnsub = { unsubscribe: () => {} };
const envError = new Error(
  "Supabase not configured. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to apps/customer/.env.local"
);

function createStubClient(): SupabaseClient {
  const reject = () => Promise.resolve({ data: null, error: envError });
  return {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: noopUnsub } }),
      getUser: () => Promise.resolve({ data: { user: null }, error: null }),
      signOut: () => Promise.resolve({ error: null }),
      startAutoRefresh: () => {},
      stopAutoRefresh: () => {},
      signInWithOtp: () => reject(),
      verifyOtp: () => reject(),
      signInWithOAuth: () => reject(),
      signInWithPassword: () => reject(),
      signUp: () => reject(),
      resetPasswordForEmail: () => reject(),
      updateUser: () => reject(),
      setSession: () => reject(),
      exchangeCodeForSession: () => reject(),
    },
  } as unknown as SupabaseClient;
}

const hasEnv = Boolean(SUPABASE_URL?.trim() && SUPABASE_ANON_KEY?.trim());

export const supabase: SupabaseClient = hasEnv
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: authStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        // Keep customer auth isolated from any other Supabase client that may
        // run in the same browser/native storage. Supabase supports multiple
        // active sessions per user; this prevents accidental local overwrites.
        storageKey: "beautonomi-customer-auth",
      },
    })
  : createStubClient();
