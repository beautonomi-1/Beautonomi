import { getSupabaseBrowserClient } from "./supabase";

const REMOTE_SIGNOUT_MS = 2800;

/** Clear Supabase browser session without hanging on GoTrue when the network is slow. */
async function clearSupabaseSessionBounded(): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;
  try {
    await Promise.race([
      supabase.auth.signOut(),
      new Promise<void>((resolve) => {
        setTimeout(resolve, REMOTE_SIGNOUT_MS);
      }),
    ]);
  } catch {
    // non-fatal
  }
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // non-fatal
  }
}

export interface SignInCredentials {
  email: string;
  password: string;
}

/**
 * Same contract as apps/web sign-in: POST /api/auth/sign-in then setSession on Supabase client.
 */
export async function signInWithPassword({ email, password }: SignInCredentials) {
  const trimmedEmail = email.trim();
  const supabase = getSupabaseBrowserClient();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);
  let res: Response;
  try {
    res = await fetch("/api/auth/sign-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: trimmedEmail, password }),
      credentials: "include",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  const json = (await res.json().catch(() => ({}))) as {
    error?: string;
    data?: { session?: { access_token: string; refresh_token: string }; user?: unknown };
  };
  const message = typeof json?.error === "string" ? json.error : "Sign-in failed. Please try again.";
  if (!res.ok) {
    throw new Error(message);
  }

  const session = json?.data?.session;
  if (session?.access_token && session?.refresh_token && supabase) {
    try {
      await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });
    } catch (err: any) {
      if (err.message?.includes("Lock") && err.message?.includes("stole it")) {
        console.warn("Ignored lock error on setSession", err);
      } else {
        throw err;
      }
    }
  }

  return json.data;
}

export async function signOut() {
  // Clear server-side session cookies first (sign-in uses Next.js server cookies).
  try {
    await fetch("/api/auth/sign-out", { method: "POST", credentials: "include" });
  } catch {
    // ignore network errors — local Supabase sign-out is the fallback
  }
  await clearSupabaseSessionBounded();
}
