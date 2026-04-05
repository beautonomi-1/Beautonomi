import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * If the user signed in after the inactivity warning was sent, clear the 30-day countdown.
 * Safe no-op when no warning or last_sign_in_at is not after the warning.
 */
export async function clearInactivityRetentionIfLoginAfterWarning(
  userId: string,
): Promise<{ cleared: boolean }> {
  const admin = getSupabaseAdmin();

  const { data: row, error: rowErr } = await admin
    .from("users")
    .select("inactivity_archive_warning_sent_at")
    .eq("id", userId)
    .maybeSingle();

  if (rowErr || !row?.inactivity_archive_warning_sent_at) {
    return { cleared: false };
  }

  const { data: authData, error: authErr } = await admin.auth.admin.getUserById(userId);
  if (authErr || !authData?.user?.last_sign_in_at) {
    return { cleared: false };
  }

  const lastSignIn = new Date(authData.user.last_sign_in_at).getTime();
  const warnedAt = new Date(row.inactivity_archive_warning_sent_at as string).getTime();
  if (!Number.isFinite(lastSignIn) || !Number.isFinite(warnedAt) || lastSignIn <= warnedAt) {
    return { cleared: false };
  }

  const { error: upErr } = await admin
    .from("users")
    .update({
      inactivity_archive_warning_sent_at: null,
      scheduled_data_archive_at: null,
    })
    .eq("id", userId);

  if (upErr) {
    console.error("[retention] clear countdown on login:", upErr.message);
    return { cleared: false };
  }

  return { cleared: true };
}
