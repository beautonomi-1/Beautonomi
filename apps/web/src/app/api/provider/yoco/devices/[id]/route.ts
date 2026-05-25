import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser } from "@/lib/supabase/api-helpers";
import { requireYocoPlatformEnabledForProvider } from "@/lib/payments/yoco-feature-gate";
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

    const providerId = await getProviderIdForUser(user.id, supabase, { request });
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
    const yocoGate = await requireYocoPlatformEnabledForProvider(supabase, providerId);
    if (yocoGate) return yocoGate;

    const { data: device, error } = await supabase
      .from("provider_yoco_devices")
      .select("*")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();
    if (!error && device) {
      // §Yoco-synergy 2026-05: mirror the list endpoint's shape so a
      // single-device fetch (e.g. for an edit drawer) returns the same
      // location_name + usage stats the picker relies on.
      const d = device as Record<string, unknown>;
      const yocoId = String(d.yoco_device_id ?? "");
      const isVirtual =
        d.credential_mode === "virtual_checkout" || yocoId.startsWith("virtual:");
      const displayId = isVirtual ? "" : yocoId;
      return NextResponse.json({
        data: {
          id: d.id,
          name: d.name,
          device_id: displayId,
          serial_number: displayId,
          device_type: isVirtual ? ("virtual_checkout" as const) : ("web_pos" as const),
          credential_mode: isVirtual ? ("virtual_checkout" as const) : ("web_pos" as const),
          location_id: d.location_id,
          location_name: d.location_name ?? null,
          is_active: d.is_active,
          total_transactions: d.total_transactions ?? 0,
          total_amount: d.total_amount ?? 0,
          last_used: d.last_used ?? null,
          created_date: d.created_at,
          created_at: d.created_at,
        },
        error: null,
      });
    }

    const { data: legacyTerminal } = await supabase
      .from("provider_yoco_terminals")
      .select("id, device_id, device_name, location_name, active, created_at")
      .eq("id", id)
      .eq("provider_id", providerId)
      .maybeSingle();
    if (legacyTerminal) {
      return NextResponse.json({
        data: {
          id: legacyTerminal.id,
          name: legacyTerminal.device_name,
          device_id: legacyTerminal.device_id,
          location_id: null,
          location_name: legacyTerminal.location_name ?? null,
          is_active: legacyTerminal.active !== false,
          created_date: legacyTerminal.created_at,
          legacy_terminal: true,
        },
        error: null,
      });
    }

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

    const providerId = await getProviderIdForUser(user.id, supabase, { request });
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
    const yocoGate = await requireYocoPlatformEnabledForProvider(supabase, providerId);
    if (yocoGate) return yocoGate;

    // §Yoco-synergy 2026-05: when the caller moves the device to a new
    // location, refresh the denormalised location_name on the same write so
    // the mobile picker + settings list don't show stale labels. If
    // location is cleared (null), wipe the name too.
    const updatePayload: Record<string, unknown> = { ...validationResult.data };
    if (Object.prototype.hasOwnProperty.call(validationResult.data, "location_id")) {
      const newLocationId = validationResult.data.location_id;
      if (newLocationId == null) {
        updatePayload.location_name = null;
      } else {
        const { data: loc } = await supabase
          .from("provider_locations")
          .select("name")
          .eq("id", newLocationId)
          .eq("provider_id", providerId)
          .maybeSingle();
        updatePayload.location_name = typeof loc?.name === "string" ? loc.name : null;
      }
    }

    const { data: device, error } = await (supabase
      .from("provider_yoco_devices") as any)
      .update(updatePayload)
      .eq("id", id)
      .eq("provider_id", providerId)
      .select()
      .single();
    if (!error && device) {
      const d = device as Record<string, unknown>;
      const yocoId = String(d.yoco_device_id ?? "");
      const isVirtual =
        d.credential_mode === "virtual_checkout" || yocoId.startsWith("virtual:");
      const displayId = isVirtual ? "" : yocoId;
      return NextResponse.json({
        data: {
          id: d.id,
          name: d.name,
          device_id: displayId,
          serial_number: displayId,
          device_type: isVirtual ? ("virtual_checkout" as const) : ("web_pos" as const),
          credential_mode: isVirtual ? ("virtual_checkout" as const) : ("web_pos" as const),
          location_id: d.location_id,
          location_name: d.location_name ?? null,
          is_active: d.is_active,
          total_transactions: d.total_transactions ?? 0,
          total_amount: d.total_amount ?? 0,
          last_used: d.last_used ?? null,
          created_date: d.created_at,
          created_at: d.created_at,
        },
        error: null,
      });
    }

    const legacyPatch: Record<string, unknown> = {};
    if (validationResult.data.name !== undefined) legacyPatch.device_name = validationResult.data.name;
    if (validationResult.data.is_active !== undefined) legacyPatch.active = validationResult.data.is_active;
    if (validationResult.data.location_id !== undefined) legacyPatch.location_name = null;
    const { data: legacyUpdated } = await (supabase
      .from("provider_yoco_terminals") as any)
      .update(legacyPatch)
      .eq("id", id)
      .eq("provider_id", providerId)
      .select()
      .maybeSingle();
    if (legacyUpdated) {
      return NextResponse.json({
        data: {
          id: legacyUpdated.id,
          name: legacyUpdated.device_name,
          device_id: legacyUpdated.device_id,
          location_id: null,
          location_name: legacyUpdated.location_name ?? null,
          is_active: legacyUpdated.active !== false,
          created_date: legacyUpdated.created_at,
          legacy_terminal: true,
        },
        error: null,
      });
    }

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

    const providerId = await getProviderIdForUser(user.id, supabase, { request });
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
    const yocoGate = await requireYocoPlatformEnabledForProvider(supabase, providerId);
    if (yocoGate) return yocoGate;

    const { data: modernDevice } = await supabase
      .from("provider_yoco_devices")
      .select("id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .maybeSingle();

    if (modernDevice) {
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
    } else {
      const { error: legacyDeleteError } = await supabase
        .from("provider_yoco_terminals")
        .delete()
        .eq("id", id)
        .eq("provider_id", providerId);
      if (legacyDeleteError) {
        console.error("Error deleting legacy device:", legacyDeleteError);
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
