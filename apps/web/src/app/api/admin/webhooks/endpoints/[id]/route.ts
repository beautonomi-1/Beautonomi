import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/requireRole";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await getSupabaseServer();
    const result = await requireRole(["superadmin"]);
    
    if (!result) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { id } = await params;

    const { data, error } = await supabase
      .from("webhook_endpoints")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;

    // Get recent events for this endpoint
    const { data: events } = await supabase
      .from("webhook_events")
      .select("*")
      .eq("endpoint_id", id)
      .order("created_at", { ascending: false })
      .limit(50);

    return NextResponse.json({
      endpoint: {
        ...data,
        secret: undefined, // Don't return secret
      },
      events: events || [],
    });
  } catch (error: any) {
    console.error("Error fetching webhook endpoint:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch webhook endpoint" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRoleInApi(["superadmin"]);

    const supabase = await getSupabaseServer();
    const { id } = await params;

    const body = await request.json();
    const {
      name,
      url,
      events,
      is_active,
      retry_count,
      timeout_seconds,
      headers,
    } = body;

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (url !== undefined) updateData.url = url;
    if (events !== undefined) updateData.events = events;
    if (is_active !== undefined) updateData.is_active = is_active;
    if (retry_count !== undefined) updateData.retry_count = retry_count;
    if (timeout_seconds !== undefined) updateData.timeout_seconds = timeout_seconds;
    if (headers !== undefined) updateData.headers = headers;

    const { data, error } = await supabase
      .from("webhook_endpoints")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return successResponse({
      endpoint: {
        ...data,
        secret: undefined,
      },
    });
  } catch (error: any) {
    return handleApiError(error, "Failed to update webhook endpoint");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRoleInApi(["superadmin"]);

    const supabase = await getSupabaseServer();
    const { id } = await params;

    const { error } = await supabase
      .from("webhook_endpoints")
      .delete()
      .eq("id", id);

    if (error) throw error;

    return successResponse({ success: true });
  } catch (error: any) {
    return handleApiError(error, "Failed to delete webhook endpoint");
  }
}
