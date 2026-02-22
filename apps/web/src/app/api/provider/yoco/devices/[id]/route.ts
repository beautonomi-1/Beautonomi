import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser } from "@/lib/supabase/api-helpers";
import { z } from "zod";

const updateDeviceSchema = z.object({
  name: z.string().min(1).optional(),
  location_id: z.string().uuid().optional().nullable(),
  is_active: z.boolean().optional(),
});

/**
 * GET /api/provider/yoco/devices/[id]
 * 
 * Get a single Yoco Web POS device
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const { id } = await params;
    const supabase = await getSupabaseServer(request);

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Provider not found",
            code: "PROVIDER_NOT_FOUND",
          },
        },
        { status: 404 }
      );
    }

    const { data: device, error } = await supabase
      .from("provider_yoco_devices")
      .select("*")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (error || !device) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Device not found",
            code: "NOT_FOUND",
          },
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      data: {
        id: device.id,
        name: device.name,
        device_id: (device as any).yoco_device_id,
        location_id: device.location_id,
        is_active: device.is_active,
        created_date: device.created_at,
      },
      error: null,
    });
  } catch (error: any) {
    const msg = error?.message ?? "";
    if (msg === "Authentication required" || msg.startsWith("Insufficient permissions")) {
      return NextResponse.json(
        { data: null, error: { message: msg, code: "UNAUTHORIZED" } },
        { status: 401 }
      );
    }
    console.error("Unexpected error in /api/provider/yoco/devices/[id]:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to fetch device",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/provider/yoco/devices/[id]
 * 
 * Update a Yoco Web POS device
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const { id } = await params;
    const supabase = await getSupabaseServer(request);
    const body = await request.json();

    // Validate request body
    const validationResult = updateDeviceSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Validation failed",
            code: "VALIDATION_ERROR",
            details: validationResult.error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          },
        },
        { status: 400 }
      );
    }

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Provider not found",
            code: "PROVIDER_NOT_FOUND",
          },
        },
        { status: 404 }
      );
    }

    const { data: device, error } = await (supabase
      .from("provider_yoco_devices") as any)
      .update(validationResult.data)
      .eq("id", id)
      .eq("provider_id", providerId)
      .select()
      .single();

    if (error || !device) {
      console.error("Error updating device:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to update device",
            code: "UPDATE_ERROR",
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: {
        id: device.id,
        name: device.name,
        device_id: device.yoco_device_id,
        location_id: device.location_id,
        is_active: device.is_active,
        created_date: device.created_at,
      },
      error: null,
    });
  } catch (error: any) {
    const msg = error?.message ?? "";
    if (msg === "Authentication required" || msg.startsWith("Insufficient permissions")) {
      return NextResponse.json(
        { data: null, error: { message: msg, code: "UNAUTHORIZED" } },
        { status: 401 }
      );
    }
    console.error("Unexpected error in /api/provider/yoco/devices/[id]:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to update device",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/provider/yoco/devices/[id]
 * 
 * Delete a Yoco Web POS device
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const { id } = await params;
    const supabase = await getSupabaseServer(request);

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Provider not found",
            code: "PROVIDER_NOT_FOUND",
          },
        },
        { status: 404 }
      );
    }

    const { error } = await supabase
      .from("provider_yoco_devices")
      .delete()
      .eq("id", id)
      .eq("provider_id", providerId);

    if (error) {
      console.error("Error deleting device:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to delete device",
            code: "DELETE_ERROR",
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: { id, deleted: true },
      error: null,
    });
  } catch (error: any) {
    const msg = error?.message ?? "";
    if (msg === "Authentication required" || msg.startsWith("Insufficient permissions")) {
      return NextResponse.json(
        { data: null, error: { message: msg, code: "UNAUTHORIZED" } },
        { status: 401 }
      );
    }
    console.error("Unexpected error in /api/provider/yoco/devices/[id]:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to delete device",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
