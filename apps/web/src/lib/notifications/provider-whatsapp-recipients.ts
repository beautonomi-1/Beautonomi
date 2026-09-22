import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Provider WhatsApp goes to the business owner only (not assignee/staff fan-out).
 */
export async function filterProviderOwnerOnlyUserIds(
  providerId: string | null | undefined,
  userIds: string[],
): Promise<string[]> {
  if (!providerId || userIds.length === 0) return userIds;
  const supabase = getSupabaseAdmin();
  const { data: provider } = await supabase
    .from("providers")
    .select("user_id")
    .eq("id", providerId)
    .maybeSingle();
  const ownerId = provider?.user_id as string | undefined;
  if (!ownerId) return [];
  return userIds.filter((id) => id === ownerId);
}

export async function shouldSkipProviderNewBookingWhatsApp(params: {
  customerId: string | null | undefined;
  providerOwnerUserId: string | null | undefined;
}): Promise<boolean> {
  if (!params.customerId || !params.providerOwnerUserId) return false;
  return params.customerId === params.providerOwnerUserId;
}
