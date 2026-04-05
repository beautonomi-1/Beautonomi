import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { parseRetentionToken } from "@/lib/retention/retention-token";

function publicOrigin(request: NextRequest): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  return new URL(request.url).origin;
}

function redirectTo(path: string, request: NextRequest) {
  return NextResponse.redirect(new URL(path, publicOrigin(request)));
}

function sameInstant(a: string | null | undefined, b: string): boolean {
  if (!a) return false;
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) < 3000;
}

/**
 * GET /api/retention/keep-active?t=...
 * Signed link from inactivity email/push: clears the scheduled archive window.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("t");
  if (!token) {
    return redirectTo("/?retention=invalid", request);
  }

  const payload = parseRetentionToken(token);
  if (!payload) {
    return redirectTo("/?retention=invalid", request);
  }

  const admin = getSupabaseAdmin();

  const { data: row, error: fetchError } = await admin
    .from("users")
    .select("id, scheduled_data_archive_at")
    .eq("id", payload.userId)
    .maybeSingle();

  if (fetchError || !row) {
    return redirectTo("/?retention=invalid", request);
  }

  if (!sameInstant(row.scheduled_data_archive_at as string | null, payload.scheduledArchiveAt)) {
    return redirectTo("/?retention=used", request);
  }

  const { error: updateError } = await admin
    .from("users")
    .update({
      inactivity_archive_warning_sent_at: null,
      scheduled_data_archive_at: null,
    })
    .eq("id", payload.userId);

  if (updateError) {
    return redirectTo("/?retention=error", request);
  }

  return redirectTo("/?retention=kept", request);
}
