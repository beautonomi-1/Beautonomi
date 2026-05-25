import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser } from "@/lib/supabase/api-helpers";
import { checkYocoFeatureAccess } from "@/lib/subscriptions/feature-access";
import { z } from "zod";
import { getYocoEndpoints } from "@/lib/payments/yoco";
import {
  getValidAccessToken,
  resolveProviderCredentialMode,
  YocoOAuthRequired,
} from "@/lib/payments/yoco-oauth";
import { requireYocoPlatformEnabledForProvider } from "@/lib/payments/yoco-feature-gate";

/** Create Web POS device: only name required (Yoco API). Optional fields for our DB. */
const createDeviceSchema = z.object({
  name: z.string().min(1, "Device name is required"),
  location_id: z.string().uuid().optional().nullable(),
  is_active: z.boolean().optional().default(true),
  credential_mode: z.enum(["web_pos", "virtual_checkout"]).optional(),
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

    // Primary source: provider_yoco_devices
    const { data: devices, error } = await supabase
      .from("provider_yoco_devices")
      .select(`
        id,
        name,
        yoco_device_id,
        location_id,
        location_name,
        is_active,
        credential_mode,
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

    // Backward compatibility: include legacy terminals for providers not fully migrated.
    // This prevents "no device to select" when a provider still has rows in provider_yoco_terminals.
    const { data: legacyTerminals, error: legacyError } = await supabase
      .from("provider_yoco_terminals")
      .select("id, device_id, device_name, location_name, active, created_at")
      .eq("provider_id", providerId)
      .order("created_at", { ascending: false });
    if (legacyError) {
      console.warn("Error fetching legacy Yoco terminals:", legacyError);
    }

    const mappedDevices = (devices || []).map((device: any) => {
      const credMode =
        device.credential_mode === "virtual_checkout"
          ? "virtual_checkout"
          : "web_pos";
      // §Yoco-OAuth 2026-05: a virtual device has no real Yoco device id and we
      // should not show the synthetic "virtual:..." placeholder in the UI.
      const yocoId = String(device.yoco_device_id ?? "");
      const isVirtual = credMode === "virtual_checkout" || yocoId.startsWith("virtual:");
      const displayId = isVirtual ? "" : yocoId;
      return {
        id: device.id,
        name: device.name,
        device_id: displayId,
        serial_number: displayId,
        device_type: isVirtual ? ("virtual_checkout" as const) : ("web_pos" as const),
        credential_mode: isVirtual ? ("virtual_checkout" as const) : ("web_pos" as const),
        location_id: device.location_id,
        location_name: device.location_name,
        is_active: device.is_active,
        total_transactions: device.total_transactions || 0,
        total_amount: device.total_amount || 0,
        last_used: device.last_used,
        created_date: device.created_at,
        created_at: device.created_at,
      };
    });

    const existingYocoIds = new Set(
      mappedDevices
        .map((d: { device_id?: string }) => (typeof d.device_id === "string" ? d.device_id : ""))
        .filter(Boolean),
    );
    const mappedLegacy = (legacyTerminals || [])
      .filter((t: any) => t?.device_id && !existingYocoIds.has(String(t.device_id)))
      .map((terminal: any) => ({
        id: terminal.id,
        name: terminal.device_name || "Yoco terminal",
        device_id: terminal.device_id,
        serial_number: terminal.device_id,
        device_type: "card_machine" as const,
        credential_mode: "web_pos" as const,
        location_id: null,
        location_name: terminal.location_name ?? null,
        is_active: terminal.active !== false,
        total_transactions: 0,
        total_amount: 0,
        last_used: null,
        created_date: terminal.created_at,
        created_at: terminal.created_at,
        legacy_terminal: true,
      }));

    return NextResponse.json({
      data: [...mappedDevices, ...mappedLegacy],
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

    // Check subscription allows Yoco integration
    const yocoAccess = await checkYocoFeatureAccess(providerId, supabase);
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

    // §Yoco-OAuth 2026-05: branch on the credential the provider has stored.
    //   - 'oauth':    Bearer OAuth JWT → real Yoco Web POS device on api.yoco.com
    //   - 'checkout': only the dashboard secret_key → create a *virtual* device
    //                 locally; payments go via the Checkout API (no per-device
    //                 endpoint exists on payments.yoco.com).
    //   - 'none':     nothing to do; tell the user to connect Yoco first.
    const credentials = await resolveProviderCredentialMode(providerId);
    if (!credentials.isEnabled || credentials.credentialMode === "none") {
      return NextResponse.json(
        {
          data: null,
          error: {
            message:
              "Connect Yoco before adding a device. Open Payment Settings → Connect Yoco to start.",
            code: "CREDENTIALS_REQUIRED",
          },
        },
        { status: 400 },
      );
    }

    let locationNameForInsert: string | null = null;
    if (validationResult.data.location_id) {
      const { data: loc } = await supabase
        .from("provider_locations")
        .select("name")
        .eq("id", validationResult.data.location_id)
        .eq("provider_id", providerId)
        .maybeSingle();
      if (loc?.name && typeof loc.name === "string") locationNameForInsert = loc.name;
    }

    const shouldCreateVirtual =
      validationResult.data.credential_mode === "virtual_checkout" ||
      credentials.credentialMode === "checkout";

    if (shouldCreateVirtual && !credentials.hasSecretKey) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message:
              "Add a Yoco Checkout secret key before creating a virtual checkout device.",
            code: "CHECKOUT_KEY_REQUIRED",
          },
        },
        { status: 400 },
      );
    }

    if (!shouldCreateVirtual && credentials.credentialMode === "oauth") {
      const endpoints = getYocoEndpoints(credentials.environment);
      let accessToken: string;
      try {
        accessToken = await getValidAccessToken(providerId, {
          environment: credentials.environment,
        });
      } catch (err) {
        if (err instanceof YocoOAuthRequired) {
          return NextResponse.json(
            { data: null, error: { message: err.message, code: err.code } },
            { status: 400 },
          );
        }
        throw err;
      }

      const yocoCreateRes = await fetch(endpoints.createWebPosDevice, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: validationResult.data.name }),
      });

      if (!yocoCreateRes.ok) {
        const errBody = await yocoCreateRes.json().catch(() => ({}));
        const yocoMessage =
          (errBody as any)?.detail ??
          (errBody as any)?.errors?.[0]?.detail ??
          (errBody as any)?.message ??
          `Yoco API error (HTTP ${yocoCreateRes.status})`;
        const isAuth = yocoCreateRes.status === 401 || yocoCreateRes.status === 403;
        console.error(
          "Yoco create device error:",
          yocoCreateRes.status,
          errBody,
        );
        return NextResponse.json(
          {
            data: null,
            error: {
              message: isAuth
                ? "Your Yoco connection was rejected. Please reconnect Yoco in Payment Settings and try again."
                : String(yocoMessage),
              code: isAuth ? "YOCO_OAUTH_EXPIRED" : "YOCO_API_ERROR",
              details: errBody,
            },
          },
          { status: yocoCreateRes.status >= 500 ? 502 : 400 },
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
          { status: 502 },
        );
      }

      const { data: device, error: insertError } = await (supabase
        .from("provider_yoco_devices") as any)
        .insert({
          provider_id: providerId,
          name: yocoDevice?.name ?? validationResult.data.name,
          yoco_device_id: yocoDeviceId,
          location_id: validationResult.data.location_id,
          location_name: locationNameForInsert,
          is_active: validationResult.data.is_active,
          credential_mode: "web_pos",
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (insertError || !device) {
        console.error("Error storing Yoco device:", insertError);
        return NextResponse.json(
          { data: null, error: { message: "Failed to save device", code: "CREATE_ERROR" } },
          { status: 500 },
        );
      }

      return NextResponse.json({
        data: {
          id: device.id,
          name: device.name,
          device_id: device.yoco_device_id,
          serial_number: device.yoco_device_id,
          device_type: "web_pos" as const,
          credential_mode: "web_pos" as const,
          location_id: device.location_id,
          is_active: device.is_active,
          created_date: device.created_at,
        },
        error: null,
      });
    }

    // credential_mode === 'checkout' or explicit virtual_checkout: create a
    // virtual station — no Yoco call.
    // Each payment will mint its own Yoco Checkout link/QR and the customer
    // will pay on Yoco's hosted page. The `yoco_device_id` is set to a stable
    // sentinel so existing reporting joins on the column do not blow up.
    const virtualDeviceId = `virtual:${crypto.randomUUID()}`;
    const { data: device, error: insertError } = await (supabase
      .from("provider_yoco_devices") as any)
      .insert({
        provider_id: providerId,
        name: validationResult.data.name,
        yoco_device_id: virtualDeviceId,
        location_id: validationResult.data.location_id,
        location_name: locationNameForInsert,
        is_active: validationResult.data.is_active,
        credential_mode: "virtual_checkout",
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError || !device) {
      console.error("Error storing virtual Yoco device:", insertError);
      return NextResponse.json(
        { data: null, error: { message: "Failed to save device", code: "CREATE_ERROR" } },
        { status: 500 },
      );
    }

    return NextResponse.json({
      data: {
        id: device.id,
        name: device.name,
        device_id: device.yoco_device_id,
        serial_number: device.yoco_device_id,
        device_type: "virtual_checkout" as const,
        credential_mode: "virtual_checkout" as const,
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
