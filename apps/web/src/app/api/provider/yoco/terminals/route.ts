import { NextResponse } from "next/server";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getProviderIdForUser } from "@/lib/supabase/api-helpers";

const DEPRECATION_HEADER =
  "Use /api/provider/yoco/devices and Sales → Yoco Integration. This endpoint proxies devices and may be removed in a future release.";

/**
 * GET /api/provider/yoco/terminals
 * Deprecated: proxies provider_yoco_devices so legacy callers see the same list as the devices API.
 */
export async function GET(request: Request) {
  try {
    const auth = await requireRole(["provider_owner", "provider_staff"], request);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(auth.user.id, supabase, { request });
    if (!providerId) {
      return NextResponse.json(
        { data: [], error: null },
        { status: 200, headers: { "Deprecation": "true", "X-Deprecation-Info": DEPRECATION_HEADER } }
      );
    }

    const { data: devices, error } = await supabase
      .from("provider_yoco_devices")
      .select("id, name, yoco_device_id, location_name, is_active, created_at, updated_at")
      .eq("provider_id", providerId)
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    const data = (devices || []).map((d: { id: string; name: string; yoco_device_id: string; location_name: string | null; is_active: boolean; created_at: string; updated_at: string }) => ({
      id: d.id,
      device_id: d.yoco_device_id,
      device_name: d.name,
      location_name: d.location_name ?? null,
      active: d.is_active,
      created_at: d.created_at,
      updated_at: d.updated_at,
    }));

    return NextResponse.json(
      { data, error: null },
      {
        status: 200,
        headers: { "Deprecation": "true", "X-Deprecation-Info": DEPRECATION_HEADER },
      }
    );
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error("Error fetching Yoco terminals (devices proxy):", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: err?.message ?? "Failed to fetch terminals",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/provider/yoco/terminals
 * Deprecated: use POST /api/provider/yoco/devices and Sales → Yoco Integration to add devices.
 */
export async function POST() {
  return NextResponse.json(
    {
      data: null,
      error: {
        message: "This endpoint is deprecated. Add devices via Sales → Yoco Integration / Yoco devices, or POST /api/provider/yoco/devices.",
        code: "DEPRECATED",
      },
    },
    { status: 410, headers: { "Deprecation": "true", "X-Deprecation-Info": DEPRECATION_HEADER } }
  );
}
