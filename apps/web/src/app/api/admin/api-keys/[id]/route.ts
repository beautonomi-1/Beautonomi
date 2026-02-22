import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/auth-server";
import { writeAuditLog } from "@/lib/audit/audit";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await requireRole(["superadmin"]);
    const supabase = await getSupabaseServer();

    const { data, error } = await supabase
      .from("api_keys")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;

    // Get usage stats
    const { data: usageStats } = await supabase
      .from("api_key_usage_logs")
      .select("endpoint, method, status_code, response_time_ms, created_at")
      .eq("api_key_id", id)
      .order("created_at", { ascending: false })
      .limit(100);

    // Calculate usage summary
    const last24Hours = new Date();
    last24Hours.setHours(last24Hours.getHours() - 24);

    const { count: recentUsage } = await supabase
      .from("api_key_usage_logs")
      .select("*", { count: "exact", head: true })
      .eq("api_key_id", id)
      .gte("created_at", last24Hours.toISOString());

    return NextResponse.json({
      key: {
        ...data,
        key_hash: undefined, // Don't return hash
      },
      usage: {
        recent: usageStats || [],
        last_24_hours: recentUsage || 0,
      },
    });
  } catch (error: any) {
    console.error("Error fetching API key:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch API key" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user } = await requireRole(["superadmin"]);
    const supabase = await getSupabaseServer();

    const body = await request.json();
    const {
      name,
      permissions,
      rate_limit_per_minute,
      rate_limit_per_hour,
      rate_limit_per_day,
      is_active,
      expires_at,
    } = body;

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (permissions !== undefined) updateData.permissions = permissions;
    if (rate_limit_per_minute !== undefined)
      updateData.rate_limit_per_minute = rate_limit_per_minute;
    if (rate_limit_per_hour !== undefined)
      updateData.rate_limit_per_hour = rate_limit_per_hour;
    if (rate_limit_per_day !== undefined)
      updateData.rate_limit_per_day = rate_limit_per_day;
    if (is_active !== undefined) updateData.is_active = is_active;
    if (expires_at !== undefined) updateData.expires_at = expires_at;

    const { data, error } = await supabase
      .from("api_keys")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: "superadmin",
      action: "admin.api_key.update",
      entity_type: "api_key",
      entity_id: id,
      metadata: { name, is_active },
    });

    return NextResponse.json({
      key: {
        ...data,
        key_hash: undefined,
      },
    });
  } catch (error: any) {
    console.error("Error updating API key:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update API key" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user } = await requireRole(["superadmin"]);
    const supabase = await getSupabaseServer();

    const { error } = await supabase
      .from("api_keys")
      .delete()
      .eq("id", id);

    if (error) throw error;

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: "superadmin",
      action: "admin.api_key.delete",
      entity_type: "api_key",
      entity_id: id,
      metadata: {},
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting API key:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete API key" },
      { status: 500 }
    );
  }
}
