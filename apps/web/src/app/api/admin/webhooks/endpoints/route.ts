import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import crypto from "crypto";

export async function GET(_request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"]);

    const supabase = await getSupabaseServer();
    const { data, error } = await supabase
      .from("webhook_endpoints")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Don't return secrets
    const safeData = (data || []).map((endpoint: any) => ({
      ...endpoint,
      secret: undefined, // Remove secret from response
    }));

    return successResponse({ endpoints: safeData });
  } catch (error: any) {
    return handleApiError(error, "Failed to fetch webhook endpoints");
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["superadmin"]);

    const supabase = await getSupabaseServer();
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

    if (!name || !url) {
      return handleApiError(
        new Error("Name and URL are required"),
        "Name and URL are required",
        "VALIDATION_ERROR",
        400
      );
    }

    // Generate webhook secret
    const secret = crypto.randomBytes(32).toString("hex");

    const { data, error } = await supabase
      .from("webhook_endpoints")
      .insert({
        name,
        url,
        secret,
        events: events || [],
        is_active: is_active !== false,
        retry_count: retry_count || 3,
        timeout_seconds: timeout_seconds || 30,
        headers: headers || {},
        created_by: user.id,
      })
      .select()
      .single();

    if (error) throw error;

    // Return the secret only once (for display)
    return successResponse({
      endpoint: {
        ...data,
        secret, // Only returned on creation
      },
    }, 201);
  } catch (error: any) {
    return handleApiError(error, "Failed to create webhook endpoint");
  }
}
