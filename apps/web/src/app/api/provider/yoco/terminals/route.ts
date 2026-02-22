import { NextResponse } from "next/server";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getProviderIdForUser } from "@/lib/supabase/api-helpers";

/**
 * GET /api/provider/yoco/terminals
 * List provider's Yoco terminals
 */
export async function GET(request: Request) {
  try {
    const auth = await requireRole(["provider_owner", "provider_staff"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(auth.user.id);
    if (!providerId) {
      return NextResponse.json(
        { data: [], error: null },
        { status: 200 }
      );
    }

    const { data: terminals, error } = await (supabase
      .from("provider_yoco_terminals") as any)
      .select("*")
      .eq("provider_id", providerId)
      .eq("active", true)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json({
      data: terminals || [],
      error: null,
    });
  } catch (error: any) {
    console.error("Error fetching Yoco terminals:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: error.message || "Failed to fetch terminals",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/provider/yoco/terminals
 * Register a new Yoco terminal for provider
 */
export async function POST(request: Request) {
  try {
    const auth = await requireRole(["provider_owner", "provider_staff"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(auth.user.id);
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

    const body = await request.json();
    const {
      device_id,
      device_name,
      api_key,
      secret_key,
      location_name,
    } = body;

    // Validate required fields
    if (!device_id || !device_name || !api_key || !secret_key) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Missing required fields: device_id, device_name, api_key, secret_key",
            code: "VALIDATION_ERROR",
          },
        },
        { status: 400 }
      );
    }

    // Check if device_id already exists
    const { data: existing } = await (supabase
      .from("provider_yoco_terminals") as any)
      .select("id")
      .eq("device_id", device_id)
      .single();

    if (existing) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Terminal with this device ID already exists",
            code: "DUPLICATE_ERROR",
          },
        },
        { status: 400 }
      );
    }

    // Create terminal record
    const { data: terminal, error: insertError } = await (supabase
      .from("provider_yoco_terminals") as any)
      .insert({
        provider_id: providerId,
        device_id,
        device_name,
        api_key, // Encrypted in production
        secret_key, // Encrypted in production
        location_name: location_name || "Main Location",
        active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      throw insertError;
    }

    return NextResponse.json({
      data: terminal,
      error: null,
    });
  } catch (error: any) {
    console.error("Error creating Yoco terminal:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: error.message || "Failed to create terminal",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
