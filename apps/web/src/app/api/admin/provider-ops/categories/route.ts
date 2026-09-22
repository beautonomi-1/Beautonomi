import { requireProviderOpsSales } from "@/lib/provider-ops/ops-route-auth";
import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";

export async function GET(request: NextRequest) {
  try {
    await requireProviderOpsSales(request);
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("global_service_categories")
      .select("id, name, slug, icon, display_order, is_active")
      .eq("is_active", true)
      .order("display_order", { ascending: true });
    if (error) throw error;

    return successResponse(data || []);
  } catch (error) {
    return handleApiError(error, "Failed to fetch categories");
  }
}
