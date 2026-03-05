import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser } from "@/lib/supabase/api-helpers";
import { checkYocoFeatureAccess } from "@/lib/subscriptions/feature-access";
import { z } from "zod";
import { YOCO_ENDPOINTS } from "@/lib/payments/yoco";

/** Create Web POS device: only name required (Yoco API). Optional fields for our DB. */
const createDeviceSchema = z.object({
  name: z.string().min(1, "Device name is required"),
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

    // Map database fields to API response format (provider app expects serial_number)
    const mappedDevices = (devices || []).map((device: any) => ({
      id: device.id,
      name: device.name,
      device_id: device.yoco_device_id,
      serial_number: device.yoco_device_id, // App display; same as device_id
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

    const secretKey = (integration as any).secret_key as string;

    // Create Web POS device on Yoco (https://developer.yoco.com/api-reference/yoco-api/web-pos/create-web-pos-device-v-1-webpos-post)
    const yocoCreateRes = await fetch(YOCO_ENDPOINTS.createWebPosDevice, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: validationResult.data.name }),
    });

    if (!yocoCreateRes.ok) {
      const errBody = await yocoCreateRes.json().catch(() => ({}));
      const message =
        (errBody as any)?.detail ?? (errBody as any)?.message ?? "Yoco API error";
      console.error("Yoco create device error:", yocoCreateRes.status, errBody);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: String(message),
            code: "YOCO_API_ERROR",
            details: errBody,
          },
        },
        { status: yocoCreateRes.status >= 500 ? 502 : 400 }
      );
    }

    const yocoDevice = (await yocoCreateRes.json()) as { id?: string; name?: string };
    const yocoDeviceId = yocoDevice?.id ?? "";
    if (!yocoDeviceId) {
      console.error("Yoco create device response missing id:", yocoDevice);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Invalid response from Yoco",
            code: "YOCO_API_ERROR",
          },
        },
        { status: 502 }
      );
    }

    // Store device in database (yoco_device_id = Yoco's returned id)
    const { data: device, error: insertError } = await (supabase
      .from("provider_yoco_devices") as any)
      .insert({
        provider_id: providerId,
        name: yocoDevice?.name ?? validationResult.data.name,
        yoco_device_id: yocoDeviceId,
        location_id: validationResult.data.location_id,
        is_active: validationResult.data.is_active,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError || !device) {
      console.error("Error storing Yoco device:", insertError);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to save device",
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
        serial_number: device.yoco_device_id,
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
