import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sendTemplateNotification } from "@/lib/notifications/onesignal";
import type { NotificationChannel } from "@/lib/notifications/onesignal";
import { buildRetentionKeepActiveUrl } from "@/lib/retention/retention-token";

export interface ClaimedInactivityUser {
  user_id: string;
  email: string | null;
  role: string;
  scheduled_data_archive_at: string;
  inactivity_archive_warning_sent_at: string;
}

function appTypeForRole(role: string): "provider" | "customer" {
  return role === "provider_owner" || role === "provider_staff" ? "provider" : "customer";
}

/**
 * Claims a batch of eligible users (DB sets warning + schedule), then sends email/push per preferences.
 */
export async function sendInactivityRetentionWarnings(batchLimit = 200): Promise<{
  claimed: number;
  notificationsAttempted: number;
  errors: string[];
}> {
  const admin = getSupabaseAdmin();
  const errors: string[] = [];

  const { data: claimedRows, error: claimError } = await admin.rpc("claim_inactivity_retention_warnings", {
    p_limit: batchLimit,
  });

  if (claimError) {
    errors.push(`claim_inactivity_retention_warnings: ${claimError.message}`);
    return { claimed: 0, notificationsAttempted: 0, errors };
  }

  const rows = (claimedRows || []) as ClaimedInactivityUser[];
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");

  let notificationsAttempted = 0;
  for (const row of rows) {
    const scheduled = row.scheduled_data_archive_at;
    if (!scheduled) continue;

    let keepActiveUrl: string;
    try {
      keepActiveUrl = buildRetentionKeepActiveUrl(row.user_id, scheduled);
    } catch (e) {
      errors.push(`token ${row.user_id}: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }

    const { data: prefs } = await admin
      .from("users")
      .select("email_notifications_enabled, push_notifications_enabled")
      .eq("id", row.user_id)
      .maybeSingle();

    const channels: NotificationChannel[] = [];
    if (prefs?.email_notifications_enabled !== false) channels.push("email");
    if (prefs?.push_notifications_enabled !== false) channels.push("push");

    if (channels.length === 0) {
      continue;
    }

    notificationsAttempted += 1;
    const result = await sendTemplateNotification(
      "account_inactivity_archive_warning",
      [row.user_id],
      { keep_active_url: keepActiveUrl, app_url: appUrl || "https://beautonomi.com" },
      channels,
      { appType: appTypeForRole(row.role) },
    );

    if (!result.success && result.error) {
      errors.push(`notify ${row.user_id}: ${result.error}`);
    }
  }

  return { claimed: rows.length, notificationsAttempted, errors };
}

export async function runInactivityRetentionArchives(): Promise<{ archived: number; error?: string }> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.rpc("run_inactivity_retention_archives");
  if (error) {
    return { archived: 0, error: error.message };
  }
  const n = typeof data === "number" ? data : Number(data);
  return { archived: Number.isFinite(n) ? n : 0 };
}
