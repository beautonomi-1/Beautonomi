import { NextResponse } from "next/server";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getProviderIdForUser } from "@/lib/supabase/api-helpers";

/**
 * GET /api/provider/yoco/terminals/[id]
 * Get terminal details
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(["provider_owner", "provider_staff"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const providerId = await getProviderIdForUser(auth.user.id);
    if (!providerId) {
      return NextResponse.json(
        { data: null, error: { message: "Provider not found", code: "NOT_FOUND" } },
        { status: 404 }
      );
    }

    const { id } = await params;
    const supabase = await getSupabaseServer(request);
    const { data: terminal, error } = await (supabase
      .from("provider_yoco_terminals") as any)
      .select("*")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (error || !terminal) {
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

    // Don't return sensitive keys in response
    const { api_key: _api_key, secret_key: _secret_key, ...safeTerminal } = terminal;

    return NextResponse.json({
      data: safeTerminal,
      error: null,
    });
  } catch (error: any) {
    console.error("Error fetching terminal:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: error.message || "Failed to fetch terminal",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/provider/yoco/terminals/[id]
 * Update terminal
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(["provider_owner", "provider_staff"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const providerId = await getProviderIdForUser(auth.user.id);
    if (!providerId) {
      return NextResponse.json(
        { data: null, error: { message: "Provider not found", code: "NOT_FOUND" } },
        { status: 404 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const updates: any = {
      updated_at: new Date().toISOString(),
    };

    if (body.device_name) updates.device_name = body.device_name;
    if (body.location_name) updates.location_name = body.location_name;
    if (body.api_key) updates.api_key = body.api_key;
    if (body.secret_key) updates.secret_key = body.secret_key;
    if (typeof body.active === "boolean") updates.active = body.active;

    const supabase = await getSupabaseServer(request);
    const { data: terminal, error } = await (supabase
      .from("provider_yoco_terminals") as any)
      .update(updates)
      .eq("id", id)
      .eq("provider_id", providerId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    if (!terminal) {
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

    // Don't return sensitive keys
    const { api_key: _api_key2, secret_key: _secret_key2, ...safeTerminal } = terminal;

    return NextResponse.json({
      data: safeTerminal,
      error: null,
    });
  } catch (error: any) {
    console.error("Error updating terminal:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: error.message || "Failed to update terminal",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/provider/yoco/terminals/[id]
 * Delete (deactivate) terminal
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(["provider_owner", "provider_staff"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const providerId = await getProviderIdForUser(auth.user.id);
    if (!providerId) {
      return NextResponse.json(
        { data: null, error: { message: "Provider not found", code: "NOT_FOUND" } },
        { status: 404 }
      );
    }

    const { id } = await params;
    const supabase = await getSupabaseServer(request);
    const { error } = await (supabase
      .from("provider_yoco_terminals") as any)
      .update({
        active: false,
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("provider_id", providerId);

    if (error) {
      throw error;
    }

    return NextResponse.json({
      data: { success: true },
      error: null,
    });
  } catch (error: any) {
    console.error("Error deleting terminal:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: error.message || "Failed to delete terminal",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
