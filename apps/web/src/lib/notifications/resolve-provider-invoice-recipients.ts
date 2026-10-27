import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getStaffPermissions, type StaffPermissions } from "@/lib/auth/permissions";

function hasBillingNoticePermission(perms: StaffPermissions): boolean {
  return perms.manage_finance === true || perms.edit_settings === true;
}

/**
 * Owner plus staff who can view platform billing (manage_finance / edit_settings).
 */
export async function resolveProviderInvoiceNoticeRecipients(
  providerId: string,
  ownerUserId: string | null | undefined,
): Promise<string[]> {
  const admin = getSupabaseAdmin();
  const recipients = new Set<string>();
  if (ownerUserId) recipients.add(ownerUserId);

  const { data: staffRows } = await admin
    .from("provider_staff")
    .select("user_id, is_active")
    .eq("provider_id", providerId)
    .eq("is_active", true);

  for (const row of staffRows ?? []) {
    const uid = (row as { user_id?: string | null }).user_id;
    if (!uid || uid === ownerUserId) continue;
    const perms = await getStaffPermissions(uid);
    if (hasBillingNoticePermission(perms)) {
      recipients.add(uid);
    }
  }

  const { data: providerRow } = await admin
    .from("providers")
    .select("billing_email")
    .eq("id", providerId)
    .maybeSingle();

  const billingEmail = (providerRow as { billing_email?: string | null } | null)?.billing_email;
  if (billingEmail?.trim()) {
    const { data: userByEmail } = await admin
      .from("users")
      .select("id")
      .ilike("email", billingEmail.trim())
      .maybeSingle();
    const billingUserId = (userByEmail as { id?: string } | null)?.id;
    if (billingUserId) recipients.add(billingUserId);
  }

  return [...recipients];
}
