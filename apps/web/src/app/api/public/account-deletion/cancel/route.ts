import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { parseDeletionCancelToken, purgeAfterMatchesStored } from "@/lib/account/deletion-cancel-token";
import { cancelScheduledAccountDeletion } from "@/lib/account/schedule-account-deletion";
import { writeAuditLog } from "@/lib/audit/audit";

function publicOrigin(request: NextRequest): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  return new URL(request.url).origin;
}

function redirectTo(path: string, request: NextRequest) {
  return NextResponse.redirect(new URL(path, publicOrigin(request)));
}

/**
 * GET /api/public/account-deletion/cancel?t=...
 * Signed link from deletion-scheduled email: cancels pending purge and restores login.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("t");
  if (!token) {
    return redirectTo("/?deletion_cancel=invalid", request);
  }

  const payload = parseDeletionCancelToken(token);
  if (!payload) {
    return redirectTo("/?deletion_cancel=invalid", request);
  }

  const admin = getSupabaseAdmin();

  const { data: row, error: fetchError } = await admin
    .from("users")
    .select("id, account_deletion_purge_after_at, deactivated_by")
    .eq("id", payload.userId)
    .maybeSingle();

  if (fetchError || !row) {
    return redirectTo("/?deletion_cancel=invalid", request);
  }

  if (row.deactivated_by !== "pending_deletion") {
    return redirectTo("/?deletion_cancel=not_pending", request);
  }

  if (!purgeAfterMatchesStored(row.account_deletion_purge_after_at as string | null, payload.purgeAfterAt)) {
    return redirectTo("/?deletion_cancel=stale", request);
  }

  const result = await cancelScheduledAccountDeletion(admin, payload.userId, payload.purgeAfterAt);
  if (!result.ok) {
    return redirectTo("/?deletion_cancel=error", request);
  }

  await writeAuditLog({
    actor_user_id: payload.userId,
    action: "user.account.deletion_cancelled",
    entity_type: "user",
    entity_id: payload.userId,
    module: "users_trust",
    risk_level: "high",
    status: "succeeded",
    metadata: { via: "email_link" },
  });

  return redirectTo("/?deletion_cancel=success", request);
}
