import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/auth-server";
import { writeAuditLog } from "@/lib/audit/audit";
import crypto from "crypto";

export async function GET(request: NextRequest) {
  try {
    await requireRole(["superadmin"]);
    const supabase = await getSupabaseServer(request);

    const { searchParams } = new URL(request.url);
    const isActive = searchParams.get("is_active");

    let query = supabase
      .from("api_keys")
      .select("*")
      .order("created_at", { ascending: false });

    if (isActive !== null) {
      query = query.eq("is_active", isActive === "true");
    }

    const { data, error } = await query;

    if (error) throw error;

    // Don't return full key hash, just prefix
    const safeData = (data || []).map((key: any) => ({
      ...key,
      key_hash: undefined, // Remove hash from response
    }));

    return NextResponse.json({ keys: safeData });
  } catch (error: any) {
    console.error("Error fetching API keys:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch API keys" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRole(["superadmin"]);
    const supabase = await getSupabaseServer(request);

    const body = await request.json();
    const {
      name,
      permissions,
      rate_limit_per_minute,
      rate_limit_per_hour,
      rate_limit_per_day,
      expires_at,
    } = body;

    if (!name) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }

    // Generate API key
    const apiKey = `bk_${crypto.randomBytes(32).toString("hex")}`;
    const keyHash = crypto.createHash("sha256").update(apiKey).digest("hex");
    const keyPrefix = apiKey.substring(0, 12) + "...";

    const { data, error } = await supabase
      .from("api_keys")
      .insert({
        name,
        key_hash: keyHash,
        key_prefix: keyPrefix,
        permissions: permissions || [],
        rate_limit_per_minute: rate_limit_per_minute || 60,
        rate_limit_per_hour: rate_limit_per_hour || 1000,
        rate_limit_per_day: rate_limit_per_day || 10000,
        expires_at: expires_at || null,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) throw error;

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: "superadmin",
      action: "admin.api_key.create",
      entity_type: "api_key",
      entity_id: data.id,
      metadata: { name },
    });

    // Return the actual key only once (for display)
    return NextResponse.json({
      key: {
        ...data,
        key_hash: undefined,
        api_key: apiKey, // Only returned on creation
      },
    });
  } catch (error: any) {
    console.error("Error creating API key:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create API key" },
      { status: 500 }
    );
  }
}
