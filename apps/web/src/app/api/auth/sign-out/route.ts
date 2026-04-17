import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

export async function POST() {
  try {
    const supabase = await getSupabaseServer();
    await supabase.auth.signOut();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
