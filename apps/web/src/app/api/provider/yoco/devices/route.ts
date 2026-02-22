import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser } from "@/lib/supabase/api-helpers";
import { checkYocoFeatureAccess } from "@/lib/subscriptions/feature-access";
import { z } from "zod";
const createDeviceSchema = z.object({
  name: z.string().min(1, "Device name is required"),
  device_id: z.string().min(1, "Yoco device ID is required"),
  location_id: z.string().uuid().optional().nullable(),
  is_active: z.boolean().optional().default(true),
});

/**
 * GET /api/provider/yoco/devices
 * 
 * List provider's Yoco Web POS devices
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);

    // Get provider ID from user
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

    // Get devices from database - optimized query selecting only needed fields
    const { data: devices, error } = await supabase
      .from("provider_yoco_devices")
      .select(`
        id,
        name,
        yoco_device_id,
        location_id,
        location_name,
        is_active,
        total_transactions,
        total_amount,
        last_used,
        created_at,
        updated_at
      `)
      .eq("provider_id", providerId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching Yoco devices:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to fetch devices",
            code: "FETCH_ERROR",
          },
        },
        { status: 500 }
      );
    }

    // Map database fields to API response format
    const mappedDevices = (devices || []).map((device: any) => ({
      id: device.id,
      name: device.name,
      device_id: device.yoco_device_id, // Map yoco_device_id to device_id for API
      location_id: device.location_id,
      location_name: device.location_name,
      is_active: device.is_active,
      total_transactions: device.total_transactions || 0,
      total_amount: device.total_amount || 0,
      last_used: device.last_used,
      created_date: device.created_at,
    }));

    return NextResponse.json({
      data: mappedDevices,
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
    console.error("Unexpected error in /api/provider/yoco/devices:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to fetch devices",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/provider/yoco/devices
 * 
 * Create a new Yoco Web POS device
 * 
 * According to Yoco API: https://developer.yoco.com/api-reference/yoco-api/web-pos/create-web-pos-device-v-1-webpos-post
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const body = await request.json();

    // Validate request body
    const validationResult = createDeviceSchema.safeParse(body);
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

    // Get provider ID
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

    // Check subscription allows Yoco integration
    const yocoAccess = await checkYocoFeatureAccess(providerId);
    if (!yocoAccess.enabled) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Yoco integration requires a subscription upgrade. Please upgrade your plan to add payment devices.",
            code: "SUBSCRIPTION_REQUIRED",
          },
        },
        { status: 403 }
      );
    }

    // Check device limit
    if (yocoAccess.maxDevices) {
      const { data: existingDevices } = await supabase
        .from("provider_yoco_devices")
        .select("id")
        .eq("provider_id", providerId);

      if ((existingDevices?.length || 0) >= yocoAccess.maxDevices) {
        return NextResponse.json(
          {
            data: null,
            error: {
              message: `You've reached your device limit (${yocoAccess.maxDevices}). Please upgrade your plan to add more devices.`,
              code: "LIMIT_REACHED",
            },
          },
          { status: 403 }
        );
      }
    }

    // Get Yoco integration credentials
    const { data: integration } = await supabase
      .from("provider_yoco_integrations")
      .select("secret_key, public_key, is_enabled")
      .eq("provider_id", providerId)
      .single();

    if (!integration || !(integration as any).is_enabled) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Yoco integration not enabled",
            code: "INTEGRATION_DISABLED",
          },
        },
        { status: 400 }
      );
    }

    const _secretKey = (integration as any).secret_key;

    // Verify device exists in Yoco (optional - can skip if device_id is trusted)
    // For now, we'll just store the device_id as provided
    // In production, you might want to verify it exists via Yoco API

    // Store device in database
    const { data: device, error: insertError } = await (supabase
      .from("provider_yoco_devices") as any)
      .insert({
        provider_id: providerId,
        name: validationResult.data.name,
        yoco_device_id: validationResult.data.device_id,
        location_id: validationResult.data.location_id,
        is_active: validationResult.data.is_active,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError || !device) {
      console.error("Error creating Yoco device:", insertError);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to create device",
            code: "CREATE_ERROR",
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
    console.error("Unexpected error in /api/provider/yoco/devices:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to create device",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
