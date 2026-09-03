import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseServer } from "@/lib/supabase/server";
import { REMEMBER_ME_COOKIE, rememberMeCookieOptions } from "@/lib/auth/remember-me";

export async function POST() {
  try {
    const supabase = await getSupabaseServer();
    await supabase.auth.signOut();
    const cookieStore = await cookies();
    cookieStore.set(REMEMBER_ME_COOKIE, "", {
      ...rememberMeCookieOptions(process.env.NODE_ENV === "production"),
      maxAge: 0,
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
