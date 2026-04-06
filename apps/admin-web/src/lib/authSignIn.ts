import { getSupabaseBrowserClient } from "./supabase";

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
    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
  }

  return json.data;
}

export async function signOut() {
  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    await supabase.auth.signOut();
  }
}
