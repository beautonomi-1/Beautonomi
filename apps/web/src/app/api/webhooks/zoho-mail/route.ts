import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { runLockedCronRoute } from "@/lib/cron/locked-cron-route";
import { syncZohoSupportInbox } from "@/lib/support/zoho-mail-ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JOB_NAME = "sync-zoho-support-mail";

function safeEqualToken(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data: mailbox } = await supabase
    .from("support_mailboxes")
    .select("id, webhook_token, inbound_enabled")
    .eq("webhook_token", token)
    .maybeSingle();

  if (!mailbox?.webhook_token || !safeEqualToken(token, mailbox.webhook_token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!mailbox.inbound_enabled) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  return runLockedCronRoute(JOB_NAME, async () => {
    const result = await syncZohoSupportInbox(supabase, { mailboxId: mailbox.id as string });
    return NextResponse.json({ ok: true, ...result });
  });
}
