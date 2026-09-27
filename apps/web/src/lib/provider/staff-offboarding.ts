import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { revokeStaffInvitations } from "@/lib/provider/staff-invitations";

/** Revoke pending invites for a staff member. */
export async function revokeStaffInvitesForMember(
  admin: SupabaseClient,
  staffId: string,
  providerId: string,
  revokedByUserId: string,
): Promise<void> {
  await revokeStaffInvitations(admin, {
    providerId,
    staffId,
    revokedBy: revokedByUserId,
  });
}

/**
 * Sign the user out of all sessions when they have no other active salon employment.
 */
export async function revokeStaffUserSessionsIfOrphaned(
  admin: SupabaseClient,
  userId: string,
): Promise<void> {
  const { data: ownsProvider } = await admin
    .from("providers")
    .select("id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (ownsProvider) return;

  const { count } = await admin
    .from("provider_staff")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_active", true)
    .is("deleted_at", null);

  if ((count ?? 0) > 0) return;

  try {
    await getSupabaseAdmin().auth.admin.signOut(userId, "global");
  } catch (err) {
    console.warn("[staff-offboarding] signOut failed:", err);
  }
}
