import { NextRequest } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import { runLockedCronRoute } from "@/lib/cron/locked-cron-route";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sendSecurityAlert } from "@/lib/notifications/security-notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const JOB_NAME = "auth-security-cleanup";

export async function GET(request: NextRequest) {
  const unauthorized = verifyCronRequest(request);
  if (unauthorized) return unauthorized;

  return runLockedCronRoute(JOB_NAME, () => runCleanup());
}

async function runCleanup() {
  const admin = getSupabaseAdmin();
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  await admin.from("auth_device_challenges").delete().lt("expires_at", cutoff);
  await admin.from("auth_step_up_grants").delete().lt("expires_at", cutoff);
  await admin.from("auth_impersonation_sessions").delete().lt("expires_at", cutoff);
  await admin
    .from("user_mfa_recovery_codes")
    .delete()
    .not("used_at", "is", null)
    .lt("used_at", new Date(Date.now() - 90 * 86400000).toISOString());
  await admin
    .from("user_security_events")
    .delete()
    .lt("created_at", new Date(Date.now() - 180 * 86400000).toISOString());

  const { data: readyAccounts } = await admin
    .from("provider_payout_accounts")
    .select("id, provider_id, cooling_off_until, account_number_last4")
    .not("cooling_off_until", "is", null)
    .lte("cooling_off_until", new Date().toISOString())
    .is("cooling_off_ready_notified_at", null)
    .is("deleted_at", null)
    .limit(200);

  let notified = 0;
  for (const acct of readyAccounts ?? []) {
    const { data: prov } = await admin
      .from("providers")
      .select("user_id")
      .eq("id", acct.provider_id)
      .maybeSingle();
    const ownerId = (prov as { user_id?: string | null } | null)?.user_id;
    if (ownerId) {
      await sendSecurityAlert({
        key: "security_payout_account_ready",
        userId: ownerId,
        eventId: `payout_ready:${acct.id}`,
        variables: {
          account_last4: String((acct as { account_number_last4?: string | null }).account_number_last4 ?? "****"),
        },
      });
      notified += 1;
    }
    await admin
      .from("provider_payout_accounts")
      .update({ cooling_off_ready_notified_at: new Date().toISOString() })
      .eq("id", acct.id);
  }

  return Response.json({ ok: true, payout_ready_notified: notified });
}
