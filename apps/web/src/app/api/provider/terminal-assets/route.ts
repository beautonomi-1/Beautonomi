/**
 * GET /api/provider/terminal-assets — list provider's terminal device assets
 */

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { getSupabaseServer } from "@/lib/supabase/server";

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const supabaseAdmin = getServiceClient();

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return errorResponse("Provider not found", "PROVIDER_NOT_FOUND", 404);

    const { data, error } = await supabaseAdmin
      .from("terminal_assets")
      .select(
        `id, serial_number, status, ownership_model, asset_value, activated_at, created_at,
         terminal_products(id, name, vendor, model),
         terminal_orders(id, order_status, commercial_model)`,
      )
      .eq("provider_id", providerId)
      .order("created_at", { ascending: false });

    if (error) return errorResponse("Failed to load assets", "LOAD_ERROR", 500, error);

    return successResponse({ assets: data ?? [] });
  } catch (error) {
    return handleApiError(error, "Failed to load terminal assets");
  }
}
