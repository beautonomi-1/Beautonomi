import { NextResponse } from "next/server";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getProviderIdForUser } from "@/lib/supabase/api-helpers";

const DEPRECATION_HEADER =
  "Use /api/provider/yoco/devices and Sales → Yoco Integration. This endpoint proxies devices and may be removed in a future release.";

/**
 * GET /api/provider/yoco/terminals/[id]
 * Deprecated: proxies provider_yoco_devices so legacy callers get device by id.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(["provider_owner", "provider_staff"], request);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(auth.user.id, supabase, { request });
    if (!providerId) {
      return NextResponse.json(
        { data: null, error: { message: "Provider not found", code: "NOT_FOUND" } },
        { status: 404 }
      );
    }

    const { id } = await params;
    const { data: device, error } = await supabase
      .from("provider_yoco_devices")
      .select("id, name, yoco_device_id, location_name, is_active, created_at, updated_at")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (error || !device) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Terminal not found",
            code: "NOT_FOUND",
          },
        },
        { status: 404 }
      );
    }

    const data = {
      id: device.id,
      device_id: device.yoco_device_id,
      device_name: device.name,
      location_name: device.location_name ?? null,
      active: device.is_active,
      created_at: device.created_at,
      updated_at: device.updated_at,
    };

    return NextResponse.json(
      { data, error: null },
      { headers: { "Deprecation": "true", "X-Deprecation-Info": DEPRECATION_HEADER } }
    );
  } catch (err: unknown) {
    const error = err as { message?: string };
    console.error("Error fetching terminal (devices proxy):", err);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: error?.message ?? "Failed to fetch terminal",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/provider/yoco/terminals/[id]
 * Deprecated: use PUT /api/provider/yoco/devices/[id].
 */
export async function PUT(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await params;
  return NextResponse.json(
    {
      data: null,
      error: {
        message: "This endpoint is deprecated. Update devices via Sales → Yoco devices, or PUT /api/provider/yoco/devices/[id].",
        code: "DEPRECATED",
      },
    },
    { status: 410, headers: { "Deprecation": "true", "X-Deprecation-Info": DEPRECATION_HEADER } }
  );
}

/**
 * DELETE /api/provider/yoco/terminals/[id]
 * Deprecated: use DELETE /api/provider/yoco/devices/[id].
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await params;
  return NextResponse.json(
    {
      data: null,
      error: {
        message: "This endpoint is deprecated. Remove devices via Sales → Yoco devices, or DELETE /api/provider/yoco/devices/[id].",
        code: "DEPRECATED",
      },
    },
    { status: 410, headers: { "Deprecation": "true", "X-Deprecation-Info": DEPRECATION_HEADER } }
  );
}
