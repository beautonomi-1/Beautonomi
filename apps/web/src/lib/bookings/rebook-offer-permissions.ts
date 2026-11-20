import type { NextRequest } from "next/server";
import { hasPermission, isProviderOwner, getStaffMember } from "@/lib/auth/permissions";
import { getSupabaseServer } from "@/lib/supabase/server";

export async function rebookOfferCanSeeClientContact(
  userId: string,
  request?: NextRequest,
): Promise<boolean> {
  if (await isProviderOwner(userId, request)) return true;
  return hasPermission(userId, "view_clients", undefined, request);
}

export async function rebookOfferCanEditClientPhone(
  userId: string,
  request?: NextRequest,
): Promise<boolean> {
  if (await isProviderOwner(userId, request)) return true;
  return hasPermission(userId, "edit_clients", undefined, request);
}

export async function rebookOfferWhatsAppHandoffAllowed(
  userId: string,
  providerId: string,
  request?: NextRequest,
): Promise<boolean> {
  const supabase = await getSupabaseServer(request);
  const staff = await getStaffMember(userId, request);
  const { data: provider } = await supabase
    .from("providers")
    .select("business_type, user_id")
    .eq("id", providerId)
    .maybeSingle();
  if (!provider) return false;

  if (provider.user_id === userId) return true;

  if (!staff || staff.provider_id !== providerId) return false;

  const role = String(staff.role ?? "").toLowerCase();
  if (role === "owner" || role === "manager" || staff.is_admin) return true;

  if (provider.business_type === "freelancer") return true;

  if (role === "employee") {
    const canView = await rebookOfferCanSeeClientContact(userId, request);
    if (!canView) return false;
    const { data: settings } = await supabase
      .from("provider_online_booking_settings")
      .select("team_members_rebook_whatsapp_handoff")
      .eq("provider_id", providerId)
      .maybeSingle();
    return Boolean((settings as { team_members_rebook_whatsapp_handoff?: boolean } | null)?.team_members_rebook_whatsapp_handoff);
  }

  return false;
}