import { NextRequest } from "next/server";
import {
  handleApiError,
  requireAuthInApi,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { readDeviceKeyFromRequest } from "@/lib/auth/trust-device";
import { hashDeviceKey } from "@/lib/auth/auth-security-db";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuthInApi(request);
    const currentKey = await readDeviceKeyFromRequest(request);
    const currentHash = currentKey ? hashDeviceKey(currentKey) : null;
    const { data } = await getSupabaseAdmin()
      .from("user_trusted_devices")
      .select("id, label, platform, last_seen_at, trusted_until, limited_until, created_at, device_key_hash")
      .eq("user_id", user.id)
      .is("revoked_at", null)
      .not("trusted_until", "is", null)
      .order("last_seen_at", { ascending: false });
    const devices = (data ?? []).map((d) => ({
      id: d.id,
      label: d.label,
      platform: d.platform,
      last_seen_at: d.last_seen_at,
      created_at: d.created_at,
      trusted_until: d.trusted_until,
      limited_until: d.limited_until,
      is_current: currentHash ? d.device_key_hash === currentHash : false,
    }));
    return successResponse({ devices });
  } catch (error) {
    return handleApiError(error);
  }
}
